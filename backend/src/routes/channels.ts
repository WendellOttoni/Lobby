import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";

const mutateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

const channelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  // List text channels
  fastify.get("/:serverId/channels", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const channels = await prisma.textChannel.findMany({
      where: { serverId },
      orderBy: { createdAt: "asc" },
    });

    return reply.send({ channels });
  });

  // Create text channel (owner only)
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

  // Delete text channel (owner only)
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
};

export default channelRoutes;
