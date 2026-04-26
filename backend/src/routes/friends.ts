import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";
import { sendToUser } from "../services/userConnections.js";

const friendsRoutes: FastifyPluginAsync = async (fastify) => {
  // Search users by username prefix
  fastify.get("/users/search", async (req, reply) => {
    await req.jwtVerify();
    const userId = (req.user as { sub: string }).sub;
    const q = (req.query as Record<string, string>).q?.trim() ?? "";
    if (q.length < 2) return reply.send({ users: [] });

    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: "insensitive" },
        NOT: { id: userId },
      },
      select: { id: true, username: true },
      take: 10,
    });
    return reply.send({ users });
  });

  // List friends and pending requests
  fastify.get("/friends", async (req, reply) => {
    await req.jwtVerify();
    const userId = (req.user as { sub: string }).sub;

    const rows = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: { id: true, username: true } },
        addressee: { select: { id: true, username: true } },
      },
    });

    const friends = rows
      .filter((r) => r.status === "accepted")
      .map((r) => {
        const other = r.requesterId === userId ? r.addressee : r.requester;
        return { id: other.id, username: other.username };
      });

    const incoming = rows
      .filter((r) => r.status === "pending" && r.addresseeId === userId)
      .map((r) => ({ id: r.id, from: { id: r.requester.id, username: r.requester.username } }));

    const outgoing = rows
      .filter((r) => r.status === "pending" && r.requesterId === userId)
      .map((r) => ({ id: r.id, to: { id: r.addressee.id, username: r.addressee.username } }));

    return reply.send({ friends, incoming, outgoing });
  });

  // Send friend request by username
  fastify.post("/friends/request", async (req, reply) => {
    await req.jwtVerify();
    const userId = (req.user as { sub: string }).sub;
    const { username } = req.body as { username: string };

    if (!username?.trim()) return reply.status(400).send({ error: "username required" });

    const target = await prisma.user.findUnique({
      where: { username: username.trim() },
      select: { id: true, username: true },
    });
    if (!target) return reply.status(404).send({ error: "Usuário não encontrado." });
    if (target.id === userId) return reply.status(400).send({ error: "Você não pode se adicionar." });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: userId },
        ],
      },
    });
    if (existing) {
      if (existing.status === "accepted") return reply.status(400).send({ error: "Já são amigos." });
      return reply.status(400).send({ error: "Solicitação já existe." });
    }

    const friendship = await prisma.friendship.create({
      data: { requesterId: userId, addresseeId: target.id },
      include: { requester: { select: { id: true, username: true } } },
    });

    sendToUser(target.id, {
      type: "friend_request",
      id: friendship.id,
      from: { id: friendship.requester.id, username: friendship.requester.username },
    });

    return reply.status(201).send({ ok: true });
  });

  // Accept friend request
  fastify.post("/friends/:requestId/accept", async (req, reply) => {
    await req.jwtVerify();
    const userId = (req.user as { sub: string }).sub;
    const { requestId } = req.params as { requestId: string };

    const friendship = await prisma.friendship.findUnique({ where: { id: requestId } });
    if (!friendship || friendship.addresseeId !== userId || friendship.status !== "pending") {
      return reply.status(404).send({ error: "Solicitação não encontrada." });
    }

    await prisma.friendship.update({ where: { id: requestId }, data: { status: "accepted" } });

    const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    sendToUser(friendship.requesterId, {
      type: "friend_accepted",
      friend: { id: userId, username: me?.username },
    });

    return reply.send({ ok: true });
  });

  // Decline or remove friend
  fastify.delete("/friends/:requestId", async (req, reply) => {
    await req.jwtVerify();
    const userId = (req.user as { sub: string }).sub;
    const { requestId } = req.params as { requestId: string };

    const friendship = await prisma.friendship.findUnique({ where: { id: requestId } });
    if (!friendship) return reply.status(404).send({ error: "Não encontrado." });
    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
      return reply.status(403).send({ error: "Sem permissão." });
    }

    await prisma.friendship.delete({ where: { id: requestId } });
    return reply.send({ ok: true });
  });
};

export default friendsRoutes;
