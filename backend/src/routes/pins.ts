import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";
import { canManageServer, getServerRole } from "../services/permissions.js";

const mutateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

const pinsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/:serverId/pins", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const pins = await prisma.messagePin.findMany({
      where: { serverId },
      orderBy: { pinnedAt: "desc" },
      include: {
        message: {
          include: { author: { select: { username: true } } },
        },
        pinner: { select: { username: true } },
      },
    });

    return reply.send({
      pins: pins.map((p) => ({
        id: p.id,
        messageId: p.messageId,
        channelId: p.channelId,
        pinnedBy: p.pinnedBy,
        pinnerName: p.pinner.username,
        pinnedAt: p.pinnedAt.toISOString(),
        message: p.message
          ? {
              id: p.message.id,
              content: p.message.content,
              createdAt: p.message.createdAt.toISOString(),
              authorId: p.message.authorId,
              authorName: p.message.author.username,
            }
          : null,
      })),
    });
  });

  fastify.post("/:serverId/pins/:messageId", {
    config: mutateLimit,
    handler: async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { serverId, messageId } = request.params as { serverId: string; messageId: string };

      const role = await getServerRole(sub, serverId);
      if (!role) return reply.status(403).send({ error: "Sem acesso" });
      if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para fixar" });

      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg || msg.serverId !== serverId) return reply.status(404).send({ error: "Mensagem não encontrada" });

      const existing = await prisma.messagePin.findUnique({ where: { messageId } });
      if (existing) return reply.status(409).send({ error: "Mensagem já está fixada" });

      const pin = await prisma.messagePin.create({
        data: { messageId, serverId, channelId: msg.channelId, pinnedBy: sub },
      });

      return reply.status(201).send({ pin });
    },
  });

  fastify.delete("/:serverId/pins/:messageId", {
    config: mutateLimit,
    handler: async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { serverId, messageId } = request.params as { serverId: string; messageId: string };

      const role = await getServerRole(sub, serverId);
      if (!role) return reply.status(403).send({ error: "Sem acesso" });
      if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para desfixar" });

      const pin = await prisma.messagePin.findUnique({ where: { messageId } });
      if (!pin || pin.serverId !== serverId) return reply.status(404).send({ error: "Pin não encontrado" });

      await prisma.messagePin.delete({ where: { messageId } });
      return reply.status(204).send();
    },
  });
};

export default pinsRoutes;
