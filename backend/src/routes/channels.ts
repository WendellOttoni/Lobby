import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";

const mutateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

const channelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/:serverId/channels", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const channels = await prisma.textChannel.findMany({
      where: { serverId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });

    const reads = channels.length > 0
      ? await prisma.channelRead.findMany({
          where: { userId: sub, channelId: { in: channels.map((c) => c.id) } },
        })
      : [];
    const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));

    const unreadGroups = channels.length > 0
      ? await prisma.message.groupBy({
          by: ["channelId"],
          where: {
            authorId: { not: sub },
            OR: channels.map((c) => {
              const lastReadAt = readMap.get(c.id);
              return lastReadAt
                ? { channelId: c.id, createdAt: { gt: lastReadAt } }
                : { channelId: c.id };
            }),
          },
          _count: { _all: true },
        })
      : [];
    const unreadByChannel = new Map(unreadGroups.map((r) => [r.channelId, r._count._all]));

    const counts = channels.map((c) => ({
      id: c.id,
      name: c.name,
      serverId: c.serverId,
      createdAt: c.createdAt,
      categoryId: c.categoryId,
      position: c.position,
      unreadCount: unreadByChannel.get(c.id) ?? 0,
    }));

    const generalUnread = await prisma.message.count({
      where: {
        serverId,
        channelId: null,
        authorId: { not: sub },
        createdAt: { gt: member.lastReadAt },
      },
    });

    return reply.send({ channels: counts, generalUnread });
  });

  fastify.post("/:serverId/channels", {
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

      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
      if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode criar canais" });

      const channel = await prisma.textChannel.create({
        data: { name, serverId },
      });

      return reply.status(201).send({ channel });
    },
  });

  fastify.patch("/:serverId/channels/:channelId", {
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
      const { serverId, channelId } = request.params as { serverId: string; channelId: string };
      const { name } = request.body as { name: string };

      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
      if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode renomear canais" });

      const channel = await prisma.textChannel.findFirst({ where: { id: channelId, serverId } });
      if (!channel) return reply.status(404).send({ error: "Canal não encontrado" });

      const updated = await prisma.textChannel.update({
        where: { id: channelId },
        data: { name: name.trim() },
      });

      return reply.send({ channel: updated });
    },
  });

  fastify.delete("/:serverId/channels/:channelId", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, channelId } = request.params as { serverId: string; channelId: string };

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode deletar canais" });

    const channel = await prisma.textChannel.findFirst({ where: { id: channelId, serverId } });
    if (!channel) return reply.status(404).send({ error: "Canal não encontrado" });

    await prisma.textChannel.delete({ where: { id: channelId } });
    return reply.status(204).send();
  });

  fastify.post("/:serverId/channels/:channelId/read", {
    config: mutateLimit,
    handler: async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { serverId, channelId } = request.params as { serverId: string; channelId: string };

      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: sub, serverId } },
        select: { id: true },
      });
      if (!member) return reply.status(403).send({ error: "Sem acesso" });

      const channel = await prisma.textChannel.findFirst({ where: { id: channelId, serverId } });
      if (!channel) return reply.status(404).send({ error: "Canal não encontrado" });

      await prisma.channelRead.upsert({
        where: { userId_channelId: { userId: sub, channelId } },
        create: { userId: sub, channelId, lastReadAt: new Date() },
        update: { lastReadAt: new Date() },
      });

      return reply.status(204).send();
    },
  });
};

export default channelRoutes;
