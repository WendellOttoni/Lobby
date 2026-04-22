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

  fastify.patch(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { username, currentPassword, newPassword } = request.body as {
        username?: string;
        currentPassword?: string;
        newPassword?: string;
      };

      const user = await prisma.user.findUniqueOrThrow({ where: { id: sub } });

      const updates: { username?: string; passwordHash?: string } = {};

      if (username && username !== user.username) {
        const taken = await prisma.user.findUnique({ where: { username } });
        if (taken) return reply.status(409).send({ error: "Username já em uso" });
        updates.username = username;
      }

      if (newPassword) {
        if (!currentPassword) {
          return reply.status(400).send({ error: "Senha atual obrigatória" });
        }
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return reply.status(401).send({ error: "Senha atual incorreta" });
        if (newPassword.length < 6) {
          return reply.status(400).send({ error: "Nova senha deve ter ao menos 6 caracteres" });
        }
        updates.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      }

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: "Nenhuma alteração enviada" });
      }

      const updated = await prisma.user.update({
        where: { id: sub },
        data: updates,
        select: { id: true, username: true, email: true, createdAt: true },
      });

      return reply.send({ user: updated });
    }
  );
};

export default authRoutes;
