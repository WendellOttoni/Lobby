import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";
import { canManageServer, canReadChannel, getServerRole } from "../services/permissions.js";

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
    const visibleChannels = canManageServer(member.role)
      ? channels
      : (await Promise.all(
          channels.map(async (channel) => ({
            channel,
            visible: await canReadChannel(sub, serverId, channel.id),
          }))
        ))
          .filter((item) => item.visible)
          .map((item) => item.channel);

    const reads = visibleChannels.length > 0
      ? await prisma.channelRead.findMany({
          where: { userId: sub, channelId: { in: visibleChannels.map((c) => c.id) } },
        })
      : [];
    const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));

    const unreadGroups = visibleChannels.length > 0
      ? await prisma.message.groupBy({
          by: ["channelId"],
          where: {
            authorId: { not: sub },
            OR: visibleChannels.map((c) => {
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

    const counts = visibleChannels.map((c) => ({
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

      const role = await getServerRole(sub, serverId);
      if (!role) return reply.status(403).send({ error: "Sem acesso" });
      if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para criar canais" });

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

      const role = await getServerRole(sub, serverId);
      if (!role) return reply.status(403).send({ error: "Sem acesso" });
      if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para renomear canais" });

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

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para deletar canais" });

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
      if (!(await canReadChannel(sub, serverId, channelId))) return reply.status(403).send({ error: "Sem acesso ao canal" });

      await prisma.channelRead.upsert({
        where: { userId_channelId: { userId: sub, channelId } },
        create: { userId: sub, channelId, lastReadAt: new Date() },
        update: { lastReadAt: new Date() },
      });

      return reply.status(204).send();
    },
  });

  fastify.get("/:serverId/channels/:channelId/permissions", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, channelId } = request.params as { serverId: string; channelId: string };

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para ver permissões" });

    const channel = await prisma.textChannel.findFirst({ where: { id: channelId, serverId }, select: { id: true } });
    if (!channel) return reply.status(404).send({ error: "Canal não encontrado" });

    const permissions = await prisma.channelPermission.findMany({
      where: { channelId },
      orderBy: { role: "asc" },
    });

    return reply.send({ permissions });
  });

  fastify.put("/:serverId/channels/:channelId/permissions/:role", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, channelId, role: targetRole } = request.params as { serverId: string; channelId: string; role: string };
    const { canRead, canWrite } = (request.body ?? {}) as { canRead?: boolean; canWrite?: boolean };

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para alterar permissões" });
    if (targetRole !== "member" && targetRole !== "admin") return reply.status(400).send({ error: "Cargo inválido" });
    if (typeof canRead !== "boolean" || typeof canWrite !== "boolean") {
      return reply.status(400).send({ error: "Permissões inválidas" });
    }

    const channel = await prisma.textChannel.findFirst({ where: { id: channelId, serverId }, select: { id: true } });
    if (!channel) return reply.status(404).send({ error: "Canal não encontrado" });

    const permission = await prisma.channelPermission.upsert({
      where: { channelId_role: { channelId, role: targetRole } },
      create: { serverId, channelId, role: targetRole, canRead, canWrite },
      update: { canRead, canWrite },
    });

    return reply.send({ permission });
  });
};

export default channelRoutes;
