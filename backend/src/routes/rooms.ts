import { FastifyPluginAsync } from "fastify";
import { AccessToken } from "livekit-server-sdk";
import prisma from "../db/client.js";
import {
  disconnectVoiceParticipant,
  forceMuteVoiceParticipant,
  getRoomService,
} from "../services/livekit.js";
import { canManageServer, getServerRole } from "../services/permissions.js";
import { recordServerAudit } from "../services/audit.js";

const mutateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

const roomsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

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
        select: { id: true, name: true, createdAt: true, categoryId: true, position: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
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

  fastify.post("/:serverId/rooms", {
    config: mutateLimit,
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

      const role = await getServerRole(sub, serverId);
      if (!role) return reply.status(403).send({ error: "Sem acesso" });
      if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para criar salas" });

      const room = await prisma.room.create({
        data: { name, serverId },
        select: { id: true, name: true, createdAt: true },
      });

      return reply.status(201).send({ room });
    },
  });

  fastify.patch("/:serverId/rooms/:roomId", {
    config: mutateLimit,
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string", minLength: 1, maxLength: 64 } },
      },
    },
    handler: async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { serverId, roomId } = request.params as { serverId: string; roomId: string };
      const { name } = request.body as { name: string };

      const role = await getServerRole(sub, serverId);
      if (!role) return reply.status(403).send({ error: "Sem acesso" });
      if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para renomear salas" });

      const room = await prisma.room.findFirst({ where: { id: roomId, serverId } });
      if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

      const updated = await prisma.room.update({
        where: { id: roomId },
        data: { name: name.trim() },
        select: { id: true, name: true, createdAt: true },
      });

      return reply.send({ room: updated });
    },
  });

  fastify.get("/:serverId/rooms/:roomId/participants", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, roomId } = request.params as { serverId: string; roomId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const room = await prisma.room.findFirst({ where: { id: roomId, serverId } });
    if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

    const lkParticipants = await getRoomService()
      .listParticipants(roomId)
      .catch(() => []);

    if (lkParticipants.length === 0) return reply.send({ participants: [] });

    const userIds = lkParticipants.map((p) => p.identity);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.username]));

    return reply.send({
      participants: lkParticipants.map((p) => ({
        identity: p.identity,
        name: userMap.get(p.identity) ?? p.name ?? p.identity,
      })),
    });
  });

  fastify.delete("/:serverId/rooms/:roomId", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, roomId } = request.params as { serverId: string; roomId: string };

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para deletar salas" });

    const room = await prisma.room.findFirst({ where: { id: roomId, serverId } });
    if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

    await prisma.room.delete({ where: { id: roomId } });
    return reply.status(204).send();
  });

  fastify.post("/:serverId/rooms/:roomId/participants/:identity/disconnect", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, roomId, identity } = request.params as {
      serverId: string;
      roomId: string;
      identity: string;
    };

    const actorRole = await getServerRole(sub, serverId);
    if (!actorRole) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(actorRole)) return reply.status(403).send({ error: "Sem permissão para moderar voz" });
    if (identity === sub) return reply.status(400).send({ error: "Você não pode se desconectar por aqui" });

    const room = await prisma.room.findFirst({ where: { id: roomId, serverId }, select: { id: true } });
    if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (server?.ownerId === identity) return reply.status(400).send({ error: "Não é possível moderar o dono" });

    const targetRole = await getServerRole(identity, serverId);
    if (actorRole !== "owner" && targetRole === "admin") {
      return reply.status(403).send({ error: "Apenas o dono pode moderar admins" });
    }

    const ok = await disconnectVoiceParticipant(roomId, identity);
    if (!ok) return reply.status(404).send({ error: "Participante não está na sala" });

    await recordServerAudit(serverId, sub, "voice.disconnect", {
      targetId: identity,
      targetType: "user",
      metadata: { roomId },
    });
    return reply.status(204).send();
  });

  fastify.post("/:serverId/rooms/:roomId/participants/:identity/mute", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, roomId, identity } = request.params as {
      serverId: string;
      roomId: string;
      identity: string;
    };

    const actorRole = await getServerRole(sub, serverId);
    if (!actorRole) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(actorRole)) return reply.status(403).send({ error: "Sem permissão para moderar voz" });
    if (identity === sub) return reply.status(400).send({ error: "Mute a si mesmo pelos controles do app" });

    const room = await prisma.room.findFirst({ where: { id: roomId, serverId }, select: { id: true } });
    if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (server?.ownerId === identity) return reply.status(400).send({ error: "Não é possível moderar o dono" });

    const targetRole = await getServerRole(identity, serverId);
    if (actorRole !== "owner" && targetRole === "admin") {
      return reply.status(403).send({ error: "Apenas o dono pode moderar admins" });
    }

    const ok = await forceMuteVoiceParticipant(roomId, identity);
    if (!ok) return reply.status(404).send({ error: "Participante não tem áudio publicado" });

    await recordServerAudit(serverId, sub, "voice.mute", {
      targetId: identity,
      targetType: "user",
      metadata: { roomId },
    });
    return reply.status(204).send();
  });

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

export default roomsRoutes;
