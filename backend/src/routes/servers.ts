import { FastifyPluginAsync } from "fastify";
import { AccessToken } from "livekit-server-sdk";
import prisma from "../db/client.js";
import { getRoomService } from "../services/livekit.js";

function generateCode(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < len; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const serversRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  // List my servers
  fastify.get("/", async (request, reply) => {
    const { sub } = request.user as { sub: string };

    const memberships = await prisma.serverMember.findMany({
      where: { userId: sub },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
            ownerId: true,
            _count: { select: { members: true, rooms: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return reply.send({ servers: memberships.map((m) => ({ ...m.server, role: m.role })) });
  });

  // Create server
  fastify.post("/", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string", minLength: 1, maxLength: 64 } },
      },
    },
    handler: async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { name } = request.body as { name: string };

      const server = await prisma.server.create({
        data: {
          name,
          inviteCode: generateCode(),
          ownerId: sub,
          members: { create: { userId: sub, role: "owner" } },
        },
        select: { id: true, name: true, inviteCode: true, ownerId: true },
      });

      return reply.status(201).send({ server });
    },
  });

  // Preview server from invite (before joining)
  fastify.get("/invite/:code", async (request, reply) => {
    const { code } = request.params as { code: string };

    const server = await prisma.server.findUnique({
      where: { inviteCode: code },
      select: {
        id: true,
        name: true,
        _count: { select: { members: true } },
      },
    });

    if (!server) return reply.status(404).send({ error: "Convite inválido" });
    return reply.send({ server });
  });

  // Join server via invite code
  fastify.post("/invite/:code/join", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { code } = request.params as { code: string };

    const server = await prisma.server.findUnique({ where: { inviteCode: code } });
    if (!server) return reply.status(404).send({ error: "Convite inválido" });

    const existing = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId: server.id } },
    });
    if (existing) return reply.send({ server, alreadyMember: true });

    await prisma.serverMember.create({
      data: { userId: sub, serverId: server.id, role: "member" },
    });

    return reply.status(201).send({ server });
  });

  // Get server (must be member)
  fastify.get("/:serverId", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, inviteCode: true, ownerId: true },
    });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });

    return reply.send({ server, role: member.role });
  });

  // Regenerate invite code (owner only)
  fastify.post("/:serverId/invite/reset", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode resetar o convite" });

    const updated = await prisma.server.update({
      where: { id: serverId },
      data: { inviteCode: generateCode() },
      select: { inviteCode: true },
    });

    return reply.send({ inviteCode: updated.inviteCode });
  });

  // List rooms in server
  fastify.get("/:serverId/rooms", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const [rooms, lkRooms] = await Promise.all([
      prisma.room.findMany({
        where: { serverId },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      getRoomService().listRooms().catch(() => []),
    ]);

    const onlineMap = new Map<string, number>(
      lkRooms.map((r) => [r.name, r.numParticipants])
    );

    return reply.send({
      rooms: rooms.map((r) => ({ ...r, onlineCount: onlineMap.get(r.id) ?? 0 })),
    });
  });

  // Create room in server
  fastify.post("/:serverId/rooms", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string", minLength: 1, maxLength: 64 } },
      },
    },
    handler: async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { serverId } = request.params as { serverId: string };
      const { name } = request.body as { name: string };

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: sub, serverId } },
      });
      if (!member) return reply.status(403).send({ error: "Sem acesso" });

      const room = await prisma.room.create({
        data: { name, serverId },
        select: { id: true, name: true, createdAt: true },
      });

      return reply.status(201).send({ room });
    },
  });

  // Get LiveKit token for room
  fastify.post("/:serverId/rooms/:roomId/token", async (request, reply) => {
    const { sub, username } = request.user as { sub: string; username: string };
    const { serverId, roomId } = request.params as { serverId: string; roomId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const room = await prisma.room.findFirst({ where: { id: roomId, serverId } });
    if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: sub, name: username }
    );

    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
    });

    return reply.send({ token: await token.toJwt(), url: process.env.LIVEKIT_URL! });
  });
};

export default serversRoutes;
