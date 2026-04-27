import { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import prisma from "../db/client.js";
import { updatePresence } from "../services/presence.js";

const SALT_ROUNDS = 12;

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authLimit = { rateLimit: { max: 8, timeWindow: "1 minute" } };

  fastify.post("/register", {
    config: authLimit,
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
      const cleanUsername = username.trim();
      const cleanEmail = email.trim().toLowerCase();

      if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
        return reply.status(400).send({ error: "Username deve conter apenas letras, números e _" });
      }

      const existing = await prisma.user.findFirst({
        where: { OR: [{ email: cleanEmail }, { username: cleanUsername }] },
      });

      if (existing) {
        return reply
          .status(409)
          .send({ error: "Username ou email já em uso" });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const user = await prisma.user.create({
        data: { username: cleanUsername, email: cleanEmail, passwordHash },
        select: { id: true, username: true, email: true, createdAt: true, avatarUrl: true },
      });

      const token = fastify.jwt.sign({ sub: user.id, username: user.username });

      return reply.status(201).send({ token, user });
    },
  });

  fastify.post("/login", {
    config: authLimit,
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
      const cleanEmail = email.trim().toLowerCase();

      const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

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
          avatarUrl: user.avatarUrl,
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
        select: { id: true, username: true, email: true, createdAt: true, statusText: true, avatarUrl: true },
      });

      if (!user) {
        return reply.status(404).send({ error: "Usuário não encontrado" });
      }

      return reply.send({ user });
    }
  );

  fastify.post(
    "/heartbeat",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { sub } = request.user as { sub: string; username: string };
      const { game } = (request.body ?? {}) as { game?: string | null };
      const user = await prisma.user.findUnique({
        where: { id: sub },
        select: { username: true, statusText: true },
      });
      if (!user) return reply.status(404).send({ error: "Usuário não encontrado" });
      updatePresence(sub, user.username, game ?? null, user.statusText);
      return reply.status(204).send();
    }
  );

  fastify.delete(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { sub } = request.user as { sub: string };
      await prisma.user.delete({ where: { id: sub } });
      return reply.status(204).send();
    }
  );

  fastify.patch(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { sub } = request.user as { sub: string };
      const { username, currentPassword, newPassword, statusText, avatarUrl } = request.body as {
        username?: string;
        currentPassword?: string;
        newPassword?: string;
        statusText?: string | null;
        avatarUrl?: string | null;
      };

      const user = await prisma.user.findUniqueOrThrow({ where: { id: sub } });

      const updates: { username?: string; passwordHash?: string; statusText?: string | null; avatarUrl?: string | null } = {};

      if (statusText !== undefined) {
        const trimmed = statusText === null ? null : String(statusText).trim().slice(0, 128);
        updates.statusText = trimmed && trimmed.length > 0 ? trimmed : null;
      }

      if (avatarUrl !== undefined) {
        const trimmed = avatarUrl === null ? null : String(avatarUrl).trim().slice(0, 512);
        const publicUrl = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
        if (trimmed && !trimmed.startsWith(`${publicUrl}/uploads/`)) {
          return reply.status(400).send({ error: "Avatar inválido" });
        }
        if (trimmed && !/\.(jpe?g|png|gif|webp)$/i.test(trimmed)) {
          return reply.status(400).send({ error: "Avatar deve ser uma imagem" });
        }
        updates.avatarUrl = trimmed || null;
      }

      const cleanUsername = username?.trim();
      if (cleanUsername && cleanUsername !== user.username) {
        if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
          return reply.status(400).send({ error: "Username deve conter apenas letras, números e _" });
        }
        const taken = await prisma.user.findUnique({ where: { username: cleanUsername } });
        if (taken) return reply.status(409).send({ error: "Username já em uso" });
        updates.username = cleanUsername;
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
        select: { id: true, username: true, email: true, createdAt: true, statusText: true, avatarUrl: true },
      });

      return reply.send({ user: updated });
    }
  );
};

export default authRoutes;
