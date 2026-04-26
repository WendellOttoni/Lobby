import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";

const mutateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

const categoriesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/:serverId/categories", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const categories = await prisma.category.findMany({
      where: { serverId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, position: true },
    });

    return reply.send({ categories });
  });

  fastify.post("/:serverId/categories", {
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
      if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode criar categorias" });

      const last = await prisma.category.findFirst({
        where: { serverId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const category = await prisma.category.create({
        data: { name: name.trim(), serverId, position: (last?.position ?? -1) + 1 },
        select: { id: true, name: true, position: true },
      });

      return reply.status(201).send({ category });
    },
  });

  fastify.patch("/:serverId/categories/:categoryId", {
    config: mutateLimit,
    schema: {
      body: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64 },
          position: { type: "integer", minimum: 0 },
        },
      },
    },
    handler: async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { serverId, categoryId } = request.params as { serverId: string; categoryId: string };
      const { name, position } = request.body as { name?: string; position?: number };

      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
      if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode editar categorias" });

      const cat = await prisma.category.findFirst({ where: { id: categoryId, serverId } });
      if (!cat) return reply.status(404).send({ error: "Categoria não encontrada" });

      const data: { name?: string; position?: number } = {};
      if (typeof name === "string") data.name = name.trim();
      if (typeof position === "number") data.position = position;

      const updated = await prisma.category.update({
        where: { id: categoryId },
        data,
        select: { id: true, name: true, position: true },
      });

      return reply.send({ category: updated });
    },
  });

  fastify.delete("/:serverId/categories/:categoryId", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, categoryId } = request.params as { serverId: string; categoryId: string };

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode deletar categorias" });

    const cat = await prisma.category.findFirst({ where: { id: categoryId, serverId } });
    if (!cat) return reply.status(404).send({ error: "Categoria não encontrada" });

    await prisma.category.delete({ where: { id: categoryId } });
    return reply.status(204).send();
  });

  // Move channel/room into (or out of) a category
  fastify.patch("/:serverId/channels/:channelId/category", {
    config: mutateLimit,
    schema: {
      body: {
        type: "object",
        properties: { categoryId: { type: ["string", "null"] } },
      },
    },
    handler: async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { serverId, channelId } = request.params as { serverId: string; channelId: string };
      const { categoryId } = request.body as { categoryId: string | null };

      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
      if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode mover canais" });

      if (categoryId) {
        const cat = await prisma.category.findFirst({ where: { id: categoryId, serverId } });
        if (!cat) return reply.status(404).send({ error: "Categoria não encontrada" });
      }

      const channel = await prisma.textChannel.findFirst({ where: { id: channelId, serverId } });
      if (!channel) return reply.status(404).send({ error: "Canal não encontrado" });

      await prisma.textChannel.update({
        where: { id: channelId },
        data: { categoryId },
      });

      return reply.status(204).send();
    },
  });

  fastify.patch("/:serverId/rooms/:roomId/category", {
    config: mutateLimit,
    schema: {
      body: {
        type: "object",
        properties: { categoryId: { type: ["string", "null"] } },
      },
    },
    handler: async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { serverId, roomId } = request.params as { serverId: string; roomId: string };
      const { categoryId } = request.body as { categoryId: string | null };

      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
      if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode mover salas" });

      if (categoryId) {
        const cat = await prisma.category.findFirst({ where: { id: categoryId, serverId } });
        if (!cat) return reply.status(404).send({ error: "Categoria não encontrada" });
      }

      const room = await prisma.room.findFirst({ where: { id: roomId, serverId } });
      if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

      await prisma.room.update({
        where: { id: roomId },
        data: { categoryId },
      });

      return reply.status(204).send();
    },
  });
};

export default categoriesRoutes;
