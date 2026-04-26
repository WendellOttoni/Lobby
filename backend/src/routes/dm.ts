import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";
import { registerWs, sendToUser } from "../services/userConnections.js";
import { AccessToken } from "livekit-server-sdk";

const HEARTBEAT_INTERVAL_MS = 30_000;

// Keeps track of active DM call rooms so we can clean them up when empty
const activeCallRooms = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRoomCleanup(roomName: string, delayMs = 5000) {
  const existing = activeCallRooms.get(roomName);
  if (existing) clearTimeout(existing);
  activeCallRooms.set(roomName, setTimeout(() => {
    activeCallRooms.delete(roomName);
    // Room cleanup in LiveKit happens automatically when all participants leave
  }, delayMs));
}

function getOrCreateConversationId(user1Id: string, user2Id: string) {
  const [a, b] = [user1Id, user2Id].sort();
  return prisma.directConversation.upsert({
    where: { user1Id_user2Id: { user1Id: a, user2Id: b } },
    create: { user1Id: a, user2Id: b },
    update: {},
  });
}

const dmRoutes: FastifyPluginAsync = async (fastify) => {
  // Global user WebSocket — DM messages + call signaling
  fastify.get("/user/ws", { websocket: true }, async (socket, req) => {
    const token = (req.query as Record<string, string>).token;

    let userId: string;
    try {
      const payload = fastify.jwt.verify<{ sub: string }>(token);
      userId = payload.sub;
      await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    } catch {
      socket.close(1008, "Unauthorized");
      return;
    }

    const unregister = registerWs(userId, socket);

    let isAlive = true;
    const heartbeat = setInterval(() => {
      if (!isAlive) { try { socket.terminate(); } catch {} return; }
      isAlive = false;
      try { socket.ping(); } catch {}
    }, HEARTBEAT_INTERVAL_MS);

    socket.on("pong", () => { isAlive = true; });

    socket.on("message", async (raw: Buffer) => {
      try {
        const data = JSON.parse(raw.toString());

        if (data.type === "dm") {
          const recipientId = typeof data.to === "string" ? data.to : null;
          const content = typeof data.content === "string" ? data.content.trim() : "";
          if (!recipientId || !content || content.length > 2000) return;

          // Must be friends
          const friendship = await prisma.friendship.findFirst({
            where: {
              status: "accepted",
              OR: [
                { requesterId: userId, addresseeId: recipientId },
                { requesterId: recipientId, addresseeId: userId },
              ],
            },
          });
          if (!friendship) return;

          const conversation = await getOrCreateConversationId(userId, recipientId);

          const msg = await prisma.directMessage.create({
            data: { content, authorId: userId, conversationId: conversation.id },
            include: { author: { select: { username: true } } },
          });

          const payload = {
            type: "dm",
            conversationId: conversation.id,
            id: msg.id,
            content: msg.content,
            createdAt: msg.createdAt.toISOString(),
            authorId: userId,
            authorName: msg.author.username,
          };

          socket.send(JSON.stringify(payload));
          sendToUser(recipientId, payload);
          return;
        }

        if (data.type === "call_invite") {
          const recipientId = typeof data.to === "string" ? data.to : null;
          if (!recipientId) return;

          const friendship = await prisma.friendship.findFirst({
            where: {
              status: "accepted",
              OR: [
                { requesterId: userId, addresseeId: recipientId },
                { requesterId: recipientId, addresseeId: userId },
              ],
            },
          });
          if (!friendship) return;

          const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
          const roomName = `dm-${[userId, recipientId].sort().join("-")}`;

          sendToUser(recipientId, {
            type: "call_invite",
            from: { id: userId, username: me?.username },
            roomName,
          });
          return;
        }

        if (data.type === "call_decline") {
          const callerId = typeof data.to === "string" ? data.to : null;
          if (!callerId) return;
          sendToUser(callerId, { type: "call_declined", by: userId });
          return;
        }

        if (data.type === "call_ended") {
          const otherId = typeof data.to === "string" ? data.to : null;
          if (!otherId) return;
          sendToUser(otherId, { type: "call_ended" });
          return;
        }
      } catch {}
    });

    socket.on("close", () => {
      clearInterval(heartbeat);
      unregister();
    });
  });

  // GET /dm/:userId/messages — load DM history
  fastify.get("/dm/:userId/messages", async (req, reply) => {
    await req.jwtVerify();
    const me = (req.user as { sub: string }).sub;
    const { userId: otherId } = req.params as { userId: string };
    const before = (req.query as Record<string, string>).before;

    const friendship = await prisma.friendship.findFirst({
      where: {
        status: "accepted",
        OR: [
          { requesterId: me, addresseeId: otherId },
          { requesterId: otherId, addresseeId: me },
        ],
      },
    });
    if (!friendship) return reply.status(403).send({ error: "Not friends." });

    const [a, b] = [me, otherId].sort();
    const conversation = await prisma.directConversation.findUnique({
      where: { user1Id_user2Id: { user1Id: a, user2Id: b } },
    });
    if (!conversation) return reply.send({ messages: [] });

    let beforeDate: Date | undefined;
    if (before) {
      const anchor = await prisma.directMessage.findUnique({ where: { id: before }, select: { createdAt: true } });
      if (anchor) beforeDate = anchor.createdAt;
    }

    const messages = await prisma.directMessage.findMany({
      where: {
        conversationId: conversation.id,
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { author: { select: { username: true } } },
    });

    return reply.send({
      messages: messages.reverse().map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString() ?? null,
        authorId: m.authorId,
        authorName: m.author.username,
        conversationId: m.conversationId,
      })),
    });
  });

  // POST /dm/:userId/call-token — generate LiveKit token for a DM call
  fastify.post("/dm/:userId/call-token", async (req, reply) => {
    await req.jwtVerify();
    const me = (req.user as { sub: string }).sub;
    const { userId: otherId } = req.params as { userId: string };

    const friendship = await prisma.friendship.findFirst({
      where: {
        status: "accepted",
        OR: [
          { requesterId: me, addresseeId: otherId },
          { requesterId: otherId, addresseeId: me },
        ],
      },
    });
    if (!friendship) return reply.status(403).send({ error: "Not friends." });

    const meUser = await prisma.user.findUnique({ where: { id: me }, select: { username: true } });

    const roomName = `dm-${[me, otherId].sort().join("-")}`;
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: me, name: meUser?.username ?? me }
    );
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    scheduleRoomCleanup(roomName, 300_000); // 5-minute max idle

    return reply.send({ token: await at.toJwt(), url: process.env.LIVEKIT_URL!, roomName });
  });
};

export default dmRoutes;
