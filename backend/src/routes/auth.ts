import { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import prisma from "../db/client.js";

const SALT_ROUNDS = 12;

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/register", {
    schema: {
      body: {
        type: "object",
        required: ["username", "email", "password"],
        properties: {
          username: { type: "string", minLength: 3, maxLength: 32 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6 },
        },
      },
    },
    handler: async (request, reply) => {
      const { username, email, password } = request.body as {
        username: string;
        email: string;
        password: string;
      };

      const existing = await prisma.user.findFirst({
        where: { OR: [{ email }, { username }] },
      });

      if (existing) {
        return reply
          .status(409)
          .send({ error: "Username ou email já em uso" });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const user = await prisma.user.create({
        data: { username, email, passwordHash },
        select: { id: true, username: true, email: true, createdAt: true },
      });

      const token = fastify.jwt.sign({ sub: user.id, username: user.username });

      return reply.status(201).send({ token, user });
    },
  });

  fastify.post("/login", {
    schema: {
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply.status(401).send({ error: "Credenciais inválidas" });
      }

      const token = fastify.jwt.sign({ sub: user.id, username: user.username });

      return reply.send({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    },
  });

  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { sub } = request.user as { sub: string };

      const user = await prisma.user.findUnique({
        where: { id: sub },
        select: { id: true, username: true, email: true, createdAt: true },
      });

      if (!user) {
        return reply.status(404).send({ error: "Usuário não encontrado" });
      }

      return reply.send({ user });
    }
  );
};

export default authRoutes;
