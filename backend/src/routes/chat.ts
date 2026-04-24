import { FastifyPluginAsync } from "fastify";
import { WebSocket } from "@fastify/websocket";
import prisma from "../db/client.js";

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  authorId: string;
  authorName: string;
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

function broadcast(serverId: string, payload: string) {
  rooms.get(serverId)?.forEach(({ ws }) => {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  });
}

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

      // Verify JWT and extract user
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

      // Check server membership
      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) {
        socket.close(1008, "Not a member");
        return;
      }

      // Join room
      if (!rooms.has(serverId)) rooms.set(serverId, new Set());
      const conn: Connection = {
        ws: socket,
        userId,
        username,
        bucket: { tokens: RATE_CAPACITY, lastRefill: Date.now() },
        isAlive: true,
      };
      rooms.get(serverId)!.add(conn);

      socket.on("pong", () => {
        conn.isAlive = true;
      });

      // Send history (last 80 messages, oldest first)
      const history = await prisma.message.findMany({
        where: { serverId },
        orderBy: { createdAt: "asc" },
        take: 80,
        include: { author: { select: { username: true } } },
      });
      socket.send(
        JSON.stringify({
          type: "history",
          messages: history.map(
            (m): ChatMessage => ({
              id: m.id,
              content: m.content,
              createdAt: m.createdAt.toISOString(),
              editedAt: m.editedAt?.toISOString() ?? null,
              authorId: m.authorId,
              authorName: m.author.username,
            })
          ),
        })
      );

      function sendError(message: string) {
        socket.send(JSON.stringify({ type: "error", message }));
      }

      socket.on("message", async (raw: Buffer) => {
        try {
          const data = JSON.parse(raw.toString());

          if (data.type === "message") {
            if (!data.content?.trim()) return;
            if (!consumeToken(conn.bucket)) {
              sendError("Você está enviando mensagens muito rápido. Aguarde alguns segundos.");
              return;
            }

            const content = String(data.content).trim().slice(0, 2000);
            const msg = await prisma.message.create({
              data: { content, authorId: userId, serverId },
              include: { author: { select: { username: true } } },
            });

            broadcast(
              serverId,
              JSON.stringify({
                type: "message",
                id: msg.id,
                content: msg.content,
                createdAt: msg.createdAt.toISOString(),
                editedAt: null,
                authorId: msg.authorId,
                authorName: msg.author.username,
              })
            );
            return;
          }

          if (data.type === "edit") {
            const id = typeof data.id === "string" ? data.id : null;
            const content = typeof data.content === "string" ? data.content.trim() : "";
            if (!id || !content) return;

            const existing = await prisma.message.findUnique({ where: { id } });
            if (!existing || existing.serverId !== serverId) return;
            if (existing.authorId !== userId) {
              sendError("Só o autor pode editar a mensagem.");
              return;
            }

            const updated = await prisma.message.update({
              where: { id },
              data: { content: content.slice(0, 2000), editedAt: new Date() },
            });

            broadcast(
              serverId,
              JSON.stringify({
                type: "edit",
                id: updated.id,
                content: updated.content,
                editedAt: updated.editedAt!.toISOString(),
              })
            );
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
            broadcast(serverId, JSON.stringify({ type: "delete", id }));
            return;
          }
        } catch {}
      });

      socket.on("close", () => {
        rooms.get(serverId)?.delete(conn);
        if (rooms.get(serverId)?.size === 0) rooms.delete(serverId);
      });
    }
  );
};

export default chatRoutes;
