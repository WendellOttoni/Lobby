import { FastifyPluginAsync } from "fastify";
import { WebSocket } from "@fastify/websocket";
import prisma from "../db/client.js";

interface ReactionCount {
  emoji: string;
  count: number;
  userIds: string[];
}

interface ReplySnippet {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
}

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  authorId: string;
  authorName: string;
  channelId: string | null;
  replyTo: ReplySnippet | null;
  reactions: ReactionCount[];
}

interface RateBucket {
  tokens: number;
  lastRefill: number;
}

interface Connection {
  ws: WebSocket;
  userId: string;
  username: string;
  bucket: RateBucket;
  isAlive: boolean;
  currentChannelId: string | null;
}

const RATE_CAPACITY = 5;
const RATE_REFILL_PER_SEC = 2;
const HEARTBEAT_INTERVAL_MS = 30_000;

function consumeToken(bucket: RateBucket): boolean {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(RATE_CAPACITY, bucket.tokens + elapsed * RATE_REFILL_PER_SEC);
  bucket.lastRefill = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

const rooms = new Map<string, Set<Connection>>();
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function broadcast(serverId: string, payload: string, excludeUserId?: string) {
  rooms.get(serverId)?.forEach((conn) => {
    if (conn.userId === excludeUserId) return;
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(payload);
  });
}

function broadcastChannel(serverId: string, channelId: string | null, payload: string) {
  rooms.get(serverId)?.forEach((conn) => {
    if (conn.currentChannelId !== channelId) return;
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(payload);
  });
}

function broadcastMessage(serverId: string, msg: ChatMessage) {
  const fullPayload = JSON.stringify({ type: "message", ...msg });
  const bumpPayload = JSON.stringify({ type: "unread_bump", channelId: msg.channelId, authorId: msg.authorId });
  rooms.get(serverId)?.forEach((conn) => {
    if (conn.ws.readyState !== conn.ws.OPEN) return;
    if (conn.currentChannelId === msg.channelId) {
      conn.ws.send(fullPayload);
    } else if (conn.userId !== msg.authorId) {
      conn.ws.send(bumpPayload);
    }
  });
}

function broadcastTyping(serverId: string, userId: string, username: string, typing: boolean, channelId: string | null) {
  const payload = JSON.stringify({ type: "typing", userId, username, typing, channelId });
  rooms.get(serverId)?.forEach((conn) => {
    if (conn.userId === userId) return;
    if (conn.currentChannelId !== channelId) return;
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(payload);
  });
}

function stopTyping(serverId: string, userId: string, username: string, channelId: string | null) {
  const key = `${serverId}:${userId}`;
  const existing = typingTimers.get(key);
  if (existing) { clearTimeout(existing); typingTimers.delete(key); }
  broadcastTyping(serverId, userId, username, false, channelId);
}

function groupReactions(rows: { emoji: string; userId: string }[]): ReactionCount[] {
  const map = new Map<string, string[]>();
  for (const { emoji, userId } of rows) {
    if (!map.has(emoji)) map.set(emoji, []);
    map.get(emoji)!.push(userId);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

function touchTyping(serverId: string, userId: string, username: string, channelId: string | null) {
  const key = `${serverId}:${userId}`;
  const existing = typingTimers.get(key);
  if (!existing) broadcastTyping(serverId, userId, username, true, channelId);
  else clearTimeout(existing);
  typingTimers.set(key, setTimeout(() => {
    typingTimers.delete(key);
    broadcastTyping(serverId, userId, username, false, channelId);
  }, 4000));
}

const EMOJI_RE = /^(\p{Extended_Pictographic}(\u{FE0F}|\u{200D}\p{Extended_Pictographic})*)+$/u;

function isValidEmoji(s: string): boolean {
  if (s.length === 0 || s.length > 16) return false;
  return EMOJI_RE.test(s);
}

function snippet(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  return trimmed.length > 120 ? trimmed.slice(0, 117) + "..." : trimmed;
}

type MessageWithRels = {
  id: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  authorId: string;
  channelId: string | null;
  author: { username: string };
  reactions: { emoji: string; userId: string }[];
  replyTo: {
    id: string;
    content: string;
    authorId: string;
    author: { username: string };
  } | null;
};

function serialize(m: MessageWithRels): ChatMessage {
  return {
    id: m.id,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    authorId: m.authorId,
    authorName: m.author.username,
    channelId: m.channelId,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          content: snippet(m.replyTo.content),
          authorId: m.replyTo.authorId,
          authorName: m.replyTo.author.username,
        }
      : null,
    reactions: groupReactions(m.reactions),
  };
}

const MESSAGE_INCLUDE = {
  author: { select: { username: true } },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      authorId: true,
      author: { select: { username: true } },
    },
  },
} as const;

const heartbeatTimer = setInterval(() => {
  for (const [serverId, conns] of rooms) {
    for (const conn of conns) {
      if (!conn.isAlive) {
        try { conn.ws.terminate(); } catch {}
        conns.delete(conn);
        continue;
      }
      conn.isAlive = false;
      try { conn.ws.ping(); } catch {}
    }
    if (conns.size === 0) rooms.delete(serverId);
  }
}, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref?.();

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/servers/:serverId/ws",
    { websocket: true },
    async (socket, req) => {
      const { serverId } = req.params as { serverId: string };
      const token = (req.query as Record<string, string>).token;

      let userId: string;
      let username: string;
      try {
        const payload = fastify.jwt.verify<{ sub: string }>(token);
        userId = payload.sub;
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { username: true },
        });
        username = user.username;
      } catch {
        socket.close(1008, "Unauthorized");
        return;
      }

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) {
        socket.close(1008, "Not a member");
        return;
      }

      if (!rooms.has(serverId)) rooms.set(serverId, new Set());
      const conn: Connection = {
        ws: socket,
        userId,
        username,
        bucket: { tokens: RATE_CAPACITY, lastRefill: Date.now() },
        isAlive: true,
        currentChannelId: null,
      };
      rooms.get(serverId)!.add(conn);

      socket.on("pong", () => {
        conn.isAlive = true;
      });

      function sendError(message: string) {
        socket.send(JSON.stringify({ type: "error", message }));
      }

      socket.on("message", async (raw: Buffer) => {
        try {
          const data = JSON.parse(raw.toString());

          if (data.type === "selectChannel") {
            const channelId = typeof data.channelId === "string" ? data.channelId : null;
            if (conn.currentChannelId !== channelId) {
              stopTyping(serverId, userId, username, conn.currentChannelId);
              conn.currentChannelId = channelId;
            }
            const history = await prisma.message.findMany({
              where: { serverId, channelId },
              orderBy: { createdAt: "asc" },
              take: 80,
              include: MESSAGE_INCLUDE,
            });
            socket.send(JSON.stringify({
              type: "history",
              channelId,
              replace: true,
              messages: history.map(serialize),
            }));
            return;
          }

          if (data.type === "loadMore") {
            const beforeId = typeof data.before === "string" ? data.before : null;
            if (!beforeId) return;
            const channelId = typeof data.channelId === "string" ? data.channelId : null;
            const anchor = await prisma.message.findUnique({ where: { id: beforeId }, select: { createdAt: true } });
            if (!anchor) return;
            const older = await prisma.message.findMany({
              where: {
                serverId,
                createdAt: { lt: anchor.createdAt },
                channelId,
              },
              orderBy: { createdAt: "desc" },
              take: 40,
              include: MESSAGE_INCLUDE,
            });
            socket.send(JSON.stringify({
              type: "history",
              prepend: true,
              channelId,
              messages: older.reverse().map(serialize),
            }));
            return;
          }

          if (data.type === "typing") {
            const channelId = typeof data.channelId === "string" ? data.channelId : null;
            touchTyping(serverId, userId, username, channelId);
            return;
          }

          if (data.type === "message") {
            if (!data.content?.trim()) return;
            const rawContent = String(data.content);
            if (rawContent.length > 2000) {
              sendError("Mensagem muito longa (máx. 2000 caracteres).");
              return;
            }
            const channelId = typeof data.channelId === "string" ? data.channelId : null;
            const replyToId = typeof data.replyToId === "string" ? data.replyToId : null;
            stopTyping(serverId, userId, username, channelId);
            if (!consumeToken(conn.bucket)) {
              sendError("Você está enviando mensagens muito rápido. Aguarde alguns segundos.");
              return;
            }

            if (channelId) {
              const channel = await prisma.textChannel.findUnique({ where: { id: channelId } });
              if (!channel || channel.serverId !== serverId) {
                sendError("Canal inválido.");
                return;
              }
            }

            if (replyToId) {
              const target = await prisma.message.findUnique({ where: { id: replyToId } });
              if (!target || target.serverId !== serverId) {
                sendError("Mensagem citada não encontrada.");
                return;
              }
            }

            const content = rawContent.trim();
            const msg = await prisma.message.create({
              data: { content, authorId: userId, serverId, channelId, replyToId },
              include: MESSAGE_INCLUDE,
            });

            broadcastMessage(serverId, serialize(msg));
            return;
          }

          if (data.type === "react") {
            const id = typeof data.id === "string" ? data.id : null;
            const emoji = typeof data.emoji === "string" ? data.emoji.trim() : "";
            if (!id || !emoji || !isValidEmoji(emoji)) return;

            const msg = await prisma.message.findUnique({ where: { id } });
            if (!msg || msg.serverId !== serverId) return;

            const existing = await prisma.messageReaction.findUnique({
              where: { messageId_userId_emoji: { messageId: id, userId, emoji } },
            });

            if (existing) {
              await prisma.messageReaction.delete({ where: { id: existing.id } });
            } else {
              await prisma.messageReaction.create({ data: { messageId: id, userId, emoji } });
            }

            const allReactions = await prisma.messageReaction.findMany({
              where: { messageId: id },
              select: { emoji: true, userId: true },
            });

            broadcastChannel(serverId, msg.channelId, JSON.stringify({
              type: "reactions",
              messageId: id,
              reactions: groupReactions(allReactions),
            }));
            return;
          }

          if (data.type === "edit") {
            const id = typeof data.id === "string" ? data.id : null;
            const content = typeof data.content === "string" ? data.content.trim() : "";
            if (!id || !content) return;
            if (content.length > 2000) {
              sendError("Mensagem muito longa (máx. 2000 caracteres).");
              return;
            }

            const existing = await prisma.message.findUnique({ where: { id } });
            if (!existing || existing.serverId !== serverId) return;
            if (existing.authorId !== userId) {
              sendError("Só o autor pode editar a mensagem.");
              return;
            }

            const updated = await prisma.message.update({
              where: { id },
              data: { content, editedAt: new Date() },
            });

            broadcastChannel(serverId, existing.channelId, JSON.stringify({
              type: "edit",
              id: updated.id,
              content: updated.content,
              editedAt: updated.editedAt!.toISOString(),
            }));
            return;
          }

          if (data.type === "delete") {
            const id = typeof data.id === "string" ? data.id : null;
            if (!id) return;

            const existing = await prisma.message.findUnique({ where: { id } });
            if (!existing || existing.serverId !== serverId) return;

            const server = await prisma.server.findUnique({
              where: { id: serverId },
              select: { ownerId: true },
            });
            const canDelete = existing.authorId === userId || server?.ownerId === userId;
            if (!canDelete) {
              sendError("Sem permissão para apagar esta mensagem.");
              return;
            }

            await prisma.message.delete({ where: { id } });
            broadcastChannel(serverId, existing.channelId, JSON.stringify({ type: "delete", id }));
            return;
          }
        } catch {}
      });

      socket.on("close", () => {
        stopTyping(serverId, userId, username, conn.currentChannelId);
        rooms.get(serverId)?.delete(conn);
        if (rooms.get(serverId)?.size === 0) rooms.delete(serverId);
      });
    }
  );
};

export default chatRoutes;
