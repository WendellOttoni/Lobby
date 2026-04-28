import { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import prisma from "../db/client.js";
import { recordServerAudit } from "../services/audit.js";

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateCode(len = 8) {
  const bytes = randomBytes(len);
  let code = "";
  for (let i = 0; i < len; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

async function uniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const exists = await prisma.server.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return generateCode(12);
}

const mutateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

function notificationScope(channelId?: string | null) {
  return channelId ? `channel:${channelId}` : "server";
}

const serversRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/", async (request, reply) => {
    const { sub } = request.user as { sub: string };

    const memberships = await prisma.serverMember.findMany({
      where: { userId: sub },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
            inviteUses: true,
            inviteMaxUses: true,
            inviteExpiresAt: true,
            ownerId: true,
            _count: { select: { members: true, rooms: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const counts =
      memberships.length === 0
        ? []
        : await prisma.message.groupBy({
            by: ["serverId"],
            where: {
              authorId: { not: sub },
              OR: memberships.map((m) => ({
                serverId: m.serverId,
                createdAt: { gt: m.lastReadAt },
              })),
            },
            _count: { _all: true },
          });

    const unreadByServer = new Map(counts.map((c) => [c.serverId, c._count._all]));

    return reply.send({
      servers: memberships.map((m) => ({
        ...m.server,
        role: m.role,
        unreadCount: unreadByServer.get(m.serverId) ?? 0,
      })),
    });
  });

  fastify.post("/:serverId/read", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
      select: { id: true },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    await prisma.serverMember.update({
      where: { id: member.id },
      data: { lastReadAt: new Date() },
    });

    return reply.status(204).send();
  });

  fastify.get("/:serverId/notification-preferences", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
      select: { id: true },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const preferences = await prisma.notificationPreference.findMany({
      where: { userId: sub, serverId },
      select: { channelId: true, muted: true },
    });

    return reply.send({ preferences });
  });

  fastify.put("/:serverId/notification-preferences", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };
    const { channelId, muted } = (request.body ?? {}) as { channelId?: string | null; muted?: boolean };

    if (typeof muted !== "boolean") return reply.status(400).send({ error: "muted obrigatório" });

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
      select: { id: true },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    if (channelId) {
      const channel = await prisma.textChannel.findFirst({ where: { id: channelId, serverId }, select: { id: true } });
      if (!channel) return reply.status(404).send({ error: "Canal não encontrado" });
    }

    await prisma.notificationPreference.upsert({
      where: { userId_serverId_scopeKey: { userId: sub, serverId, scopeKey: notificationScope(channelId) } },
      create: { userId: sub, serverId, channelId: channelId ?? null, scopeKey: notificationScope(channelId), muted },
      update: { muted },
    });

    return reply.status(204).send();
  });

  fastify.post("/", {
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
      const { name } = request.body as { name: string };

      const server = await prisma.server.create({
        data: {
          name,
          inviteCode: await uniqueInviteCode(),
          inviteUses: 0,
          ownerId: sub,
          members: { create: { userId: sub, role: "owner" } },
        },
        select: {
          id: true,
          name: true,
          inviteCode: true,
          inviteUses: true,
          inviteMaxUses: true,
          inviteExpiresAt: true,
          ownerId: true,
        },
      });

      return reply.status(201).send({ server });
    },
  });

  fastify.get("/invite/:code", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { code } = request.params as { code: string };

    const server = await prisma.server.findUnique({
      where: { inviteCode: code },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        inviteUses: true,
        inviteMaxUses: true,
        inviteExpiresAt: true,
        _count: { select: { members: true } },
      },
    });

    if (!server) return reply.status(404).send({ error: "Convite inválido" });
    if (server.inviteExpiresAt && server.inviteExpiresAt.getTime() < Date.now()) {
      return reply.status(410).send({ error: "Convite expirado" });
    }
    if (server.inviteMaxUses !== null && server.inviteUses >= server.inviteMaxUses) {
      return reply.status(410).send({ error: "Convite esgotado" });
    }
    return reply.send({ server });
  });

  fastify.post("/invite/:code/join", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { code } = request.params as { code: string };

    const server = await prisma.server.findUnique({ where: { inviteCode: code } });
    if (!server) return reply.status(404).send({ error: "Convite inválido" });
    if (server.inviteExpiresAt && server.inviteExpiresAt.getTime() < Date.now()) {
      return reply.status(410).send({ error: "Convite expirado" });
    }
    if (server.inviteMaxUses !== null && server.inviteUses >= server.inviteMaxUses) {
      return reply.status(410).send({ error: "Convite esgotado" });
    }

    const ban = await prisma.serverBan.findUnique({
      where: { userId_serverId: { userId: sub, serverId: server.id } },
      select: { id: true },
    });
    if (ban) return reply.status(403).send({ error: "Você está banido deste servidor" });

    const existing = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId: server.id } },
    });
    if (existing) return reply.send({ server, alreadyMember: true });

    await prisma.$transaction([
      prisma.serverMember.create({
        data: { userId: sub, serverId: server.id, role: "member" },
      }),
      prisma.server.update({
        where: { id: server.id },
        data: { inviteUses: { increment: 1 } },
      }),
    ]);
    await recordServerAudit(server.id, sub, "member.join", { targetId: sub, targetType: "user" });

    return reply.status(201).send({ server });
  });

  fastify.get("/:serverId", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        inviteUses: true,
        inviteMaxUses: true,
        inviteExpiresAt: true,
        ownerId: true,
      },
    });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });

    return reply.send({ server, role: member.role });
  });

  fastify.delete("/:serverId", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode deletar o servidor" });

    await prisma.server.delete({ where: { id: serverId } });
    return reply.status(204).send();
  });

  fastify.post("/:serverId/transfer", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };
    const { userId: newOwnerId } = request.body as { userId?: string };

    if (!newOwnerId) return reply.status(400).send({ error: "userId obrigatório" });

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode transferir" });
    if (newOwnerId === sub) return reply.status(400).send({ error: "Você já é o dono" });

    const targetMember = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: newOwnerId, serverId } },
    });
    if (!targetMember) return reply.status(404).send({ error: "Usuário não é membro do servidor" });

    await prisma.$transaction([
      prisma.server.update({ where: { id: serverId }, data: { ownerId: newOwnerId } }),
      prisma.serverMember.update({
        where: { userId_serverId: { userId: newOwnerId, serverId } },
        data: { role: "owner" },
      }),
      prisma.serverMember.update({
        where: { userId_serverId: { userId: sub, serverId } },
        data: { role: "member" },
      }),
    ]);
    await recordServerAudit(serverId, sub, "server.transfer", {
      targetId: newOwnerId,
      targetType: "user",
      metadata: { previousOwnerId: sub },
    });

    return reply.status(204).send();
  });

  fastify.post("/:serverId/leave", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId === sub) return reply.status(400).send({ error: "O dono não pode sair do servidor — delete-o ou transfira a propriedade" });

    await prisma.serverMember.delete({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    await recordServerAudit(serverId, sub, "member.leave", { targetId: sub, targetType: "user" });

    return reply.status(204).send();
  });

  fastify.post("/:serverId/invite/reset", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode resetar o convite" });

    const { maxUses, expiresInHours } = (request.body ?? {}) as {
      maxUses?: number | null;
      expiresInHours?: number | null;
    };

    const safeMaxUses =
      typeof maxUses === "number" && Number.isFinite(maxUses) && maxUses > 0
        ? Math.min(Math.floor(maxUses), 10_000)
        : null;
    const safeExpiresAt =
      typeof expiresInHours === "number" && Number.isFinite(expiresInHours) && expiresInHours > 0
        ? new Date(Date.now() + Math.min(Math.floor(expiresInHours), 24 * 365) * 60 * 60 * 1000)
        : null;

    const updated = await prisma.server.update({
      where: { id: serverId },
      data: {
        inviteCode: await uniqueInviteCode(),
        inviteUses: 0,
        inviteMaxUses: safeMaxUses,
        inviteExpiresAt: safeExpiresAt,
      },
      select: { inviteCode: true, inviteUses: true, inviteMaxUses: true, inviteExpiresAt: true },
    });
    await recordServerAudit(serverId, sub, "invite.reset", {
      targetId: serverId,
      targetType: "invite",
      metadata: { maxUses: safeMaxUses, expiresAt: safeExpiresAt?.toISOString() ?? null },
    });

    return reply.send({
      inviteCode: updated.inviteCode,
      inviteUses: updated.inviteUses,
      inviteMaxUses: updated.inviteMaxUses,
      inviteExpiresAt: updated.inviteExpiresAt?.toISOString() ?? null,
    });
  });
};

export default serversRoutes;
