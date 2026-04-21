import { FastifyPluginAsync } from "fastify";
import { AccessToken } from "livekit-server-sdk";
import prisma from "../db/client.js";

const roomsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post("/", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64 },
        },
      },
    },
    handler: async (request, reply) => {
      const { name } = request.body as { name: string };

      const room = await prisma.room.create({
        data: { name },
        select: { id: true, name: true, createdAt: true },
      });

      return reply.status(201).send({ room });
    },
  });

  fastify.get("/", async (_request, reply) => {
    const rooms = await prisma.room.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ rooms });
  });

  fastify.post("/:roomId/token", async (request, reply) => {
    const { sub, username } = request.user as {
      sub: string;
      username: string;
    };
    const { roomId } = request.params as { roomId: string };

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return reply.status(404).send({ error: "Sala não encontrada" });
    }

    const apiKey = process.env.LIVEKIT_API_KEY!;
    const apiSecret = process.env.LIVEKIT_API_SECRET!;
    const livekitUrl = process.env.LIVEKIT_URL!;

    const token = new AccessToken(apiKey, apiSecret, {
      identity: sub,
      name: username,
    });

    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    return reply.send({ token: jwt, url: livekitUrl });
  });
};

export default roomsRoutes;
