import { FastifyPluginAsync } from "fastify";
import { AccessToken } from "livekit-server-sdk";
import { randomBytes } from "node:crypto";
import prisma from "../db/client.js";
import { getRoomService } from "../services/livekit.js";
import { isOnline, getPresence } from "../services/presence.js";
import { canManageServer, canReadChannel, getServerRole } from "../services/permissions.js";
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

interface SearchFilters {
  text: string;
  from?: string;
  channel?: string;
  before?: Date;
  after?: Date;
  hasLink?: boolean;
  hasImage?: boolean;
}

function parseSearchQuery(raw: string): SearchFilters {
  const filters: SearchFilters = { text: "" };
  const tokens = raw.split(/\s+/);
  const remaining: string[] = [];
  for (const tok of tokens) {
    const colon = tok.indexOf(":");
    if (colon > 0) {
      const key = tok.slice(0, colon).toLowerCase();
      const val = tok.slice(colon + 1);
      if (key === "from" && val) { filters.from = val; continue; }
      if (key === "in" && val) { filters.channel = val.replace(/^#/, ""); continue; }
      if (key === "before" && val) { const d = new Date(val); if (!isNaN(d.getTime())) { filters.before = d; continue; } }
      if (key === "after" && val) { const d = new Date(val); if (!isNaN(d.getTime())) { filters.after = d; continue; } }
      if (key === "has") {
        if (val === "link") { filters.hasLink = true; continue; }
        if (val === "image" || val === "img") { filters.hasImage = true; continue; }
      }
    }
    remaining.push(tok);
  }
  filters.text = remaining.join(" ").trim();
  return filters;
}

const serversRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  // List my servers
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

  // Mark server as read
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

  // Create server
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

  // Preview server from invite (before joining)
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

  // Join server via invite code
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

  // Get server (must be member)
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

  // Delete server (owner only)
  fastify.delete("/:serverId", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode deletar o servidor" });

    await prisma.server.delete({ where: { id: serverId } });
    return reply.status(204).send();
  });

  // Transfer ownership (owner only)
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

  // Leave server (non-owners only)
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

  // Regenerate invite code (owner only)
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

  // List rooms in server
  fastify.get("/:serverId/rooms", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const [rooms, lkRooms] = await Promise.all([
      prisma.room.findMany({
        where: { serverId },
        select: { id: true, name: true, createdAt: true, categoryId: true, position: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      }),
      getRoomService().listRooms().catch(() => []),
    ]);

    const onlineMap = new Map<string, number>(
      lkRooms.map((r) => [r.name, r.numParticipants])
    );

    return reply.send({
      rooms: rooms.map((r) => ({ ...r, onlineCount: onlineMap.get(r.id) ?? 0 })),
    });
  });

  // Create room in server
  fastify.post("/:serverId/rooms", {
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
      if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para criar salas" });

      const room = await prisma.room.create({
        data: { name, serverId },
        select: { id: true, name: true, createdAt: true },
      });

      return reply.status(201).send({ room });
    },
  });

  // Rename room (admin/owner only)
  fastify.patch("/:serverId/rooms/:roomId", {
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
      const { serverId, roomId } = request.params as { serverId: string; roomId: string };
      const { name } = request.body as { name: string };

      const role = await getServerRole(sub, serverId);
      if (!role) return reply.status(403).send({ error: "Sem acesso" });
      if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para renomear salas" });

      const room = await prisma.room.findFirst({ where: { id: roomId, serverId } });
      if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

      const updated = await prisma.room.update({
        where: { id: roomId },
        data: { name: name.trim() },
        select: { id: true, name: true, createdAt: true },
      });

      return reply.send({ room: updated });
    },
  });

  // List participants currently in a voice room (LiveKit)
  fastify.get("/:serverId/rooms/:roomId/participants", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, roomId } = request.params as { serverId: string; roomId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const room = await prisma.room.findFirst({ where: { id: roomId, serverId } });
    if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

    const lkParticipants = await getRoomService()
      .listParticipants(roomId)
      .catch(() => []);

    if (lkParticipants.length === 0) return reply.send({ participants: [] });

    const userIds = lkParticipants.map((p) => p.identity);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.username]));

    return reply.send({
      participants: lkParticipants.map((p) => ({
        identity: p.identity,
        name: userMap.get(p.identity) ?? p.name ?? p.identity,
      })),
    });
  });

  // Delete room (admin/owner only)
  fastify.delete("/:serverId/rooms/:roomId", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, roomId } = request.params as { serverId: string; roomId: string };

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para deletar salas" });

    const room = await prisma.room.findFirst({ where: { id: roomId, serverId } });
    if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

    await prisma.room.delete({ where: { id: roomId } });
    return reply.status(204).send();
  });

  // List server members with online status
  fastify.get("/:serverId/members", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const members = await prisma.serverMember.findMany({
      where: { serverId },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
      orderBy: { joinedAt: "asc" },
    });

    return reply.send({
      members: members.map((m) => {
        const online = isOnline(m.userId);
        const presence = getPresence(m.userId);
        return {
          id: m.user.id,
          username: m.user.username,
          avatarUrl: m.user.avatarUrl,
          role: m.role,
          online,
          game: presence?.game ?? null,
          statusText: presence?.statusText ?? null,
        };
      }),
    });
  });

  fastify.patch("/:serverId/members/:userId/role", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, userId } = request.params as { serverId: string; userId: string };
    const { role } = request.body as { role?: string };

    if (role !== "admin" && role !== "member") {
      return reply.status(400).send({ error: "Cargo inválido" });
    }

    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId !== sub) return reply.status(403).send({ error: "Apenas o dono pode alterar cargos" });
    if (userId === sub) return reply.status(400).send({ error: "Você já é o dono" });

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: { id: true, role: true },
    });
    if (!member) return reply.status(404).send({ error: "Membro não encontrado" });
    if (member.role === "owner") return reply.status(400).send({ error: "Não é possível alterar o dono por aqui" });

    const updated = await prisma.serverMember.update({
      where: { id: member.id },
      data: { role },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
    await recordServerAudit(serverId, sub, "member.role", {
      targetId: userId,
      targetType: "user",
      metadata: { previousRole: member.role, nextRole: role },
    });

    return reply.send({
      member: {
        id: updated.user.id,
        username: updated.user.username,
        avatarUrl: updated.user.avatarUrl,
        role: updated.role,
      },
    });
  });

  fastify.post("/:serverId/members/:userId/kick", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, userId } = request.params as { serverId: string; userId: string };

    const actorRole = await getServerRole(sub, serverId);
    if (!actorRole) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(actorRole)) return reply.status(403).send({ error: "Sem permissão para expulsar membros" });
    if (userId === sub) return reply.status(400).send({ error: "Você não pode expulsar a si mesmo" });

    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId === userId) return reply.status(400).send({ error: "Não é possível expulsar o dono" });

    const target = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: { id: true, role: true },
    });
    if (!target) return reply.status(404).send({ error: "Membro não encontrado" });
    if (actorRole !== "owner" && target.role === "admin") {
      return reply.status(403).send({ error: "Admins só podem ser removidos pelo dono" });
    }

    await prisma.serverMember.delete({ where: { id: target.id } });
    await recordServerAudit(serverId, sub, "member.kick", {
      targetId: userId,
      targetType: "user",
      metadata: { targetRole: target.role },
    });
    return reply.status(204).send();
  });

  fastify.post("/:serverId/members/:userId/ban", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, userId } = request.params as { serverId: string; userId: string };
    const { reason } = (request.body ?? {}) as { reason?: string };

    const actorRole = await getServerRole(sub, serverId);
    if (!actorRole) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(actorRole)) return reply.status(403).send({ error: "Sem permissão para banir membros" });
    if (userId === sub) return reply.status(400).send({ error: "Você não pode banir a si mesmo" });

    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server) return reply.status(404).send({ error: "Servidor não encontrado" });
    if (server.ownerId === userId) return reply.status(400).send({ error: "Não é possível banir o dono" });

    const target = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: { id: true, role: true },
    });
    if (target && actorRole !== "owner" && target.role === "admin") {
      return reply.status(403).send({ error: "Admins só podem ser banidos pelo dono" });
    }

    await prisma.$transaction([
      prisma.serverBan.upsert({
        where: { userId_serverId: { userId, serverId } },
        create: {
          userId,
          serverId,
          bannedBy: sub,
          reason: reason?.trim().slice(0, 256) || null,
        },
        update: {
          bannedBy: sub,
          reason: reason?.trim().slice(0, 256) || null,
          createdAt: new Date(),
        },
      }),
      ...(target ? [prisma.serverMember.delete({ where: { id: target.id } })] : []),
    ]);
    await recordServerAudit(serverId, sub, "member.ban", {
      targetId: userId,
      targetType: "user",
      metadata: { reason: reason?.trim().slice(0, 256) || null, targetRole: target?.role ?? null },
    });

    return reply.status(204).send();
  });

  fastify.get("/:serverId/bans", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para ver banidos" });

    const bans = await prisma.serverBan.findMany({
      where: { serverId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        banner: { select: { id: true, username: true } },
      },
    });

    return reply.send({
      bans: bans.map((ban) => ({
        id: ban.id,
        userId: ban.userId,
        username: ban.user.username,
        avatarUrl: ban.user.avatarUrl,
        bannedBy: ban.bannedBy,
        bannedByName: ban.banner.username,
        reason: ban.reason,
        createdAt: ban.createdAt.toISOString(),
      })),
    });
  });

  fastify.delete("/:serverId/bans/:userId", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, userId } = request.params as { serverId: string; userId: string };

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para remover banimento" });

    await prisma.serverBan.delete({
      where: { userId_serverId: { userId, serverId } },
    }).catch(() => undefined);
    await recordServerAudit(serverId, sub, "member.unban", { targetId: userId, targetType: "user" });

    return reply.status(204).send();
  });

  fastify.get("/:serverId/audit", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para ver auditoria" });

    const logs = await prisma.serverAuditLog.findMany({
      where: { serverId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { actor: { select: { id: true, username: true } } },
    });

    return reply.send({
      logs: logs.map((log) => ({
        id: log.id,
        actorId: log.actorId,
        actorName: log.actor.username,
        action: log.action,
        targetId: log.targetId,
        targetType: log.targetType,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  });

  // Search messages in server (supports filters: from:user has:link has:image before:YYYY-MM-DD after:YYYY-MM-DD in:channel)
  fastify.get("/:serverId/messages/search", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };
    const { q } = request.query as { q?: string };

    if (!q || q.trim().length < 2) return reply.status(400).send({ error: "Query deve ter ao menos 2 caracteres" });

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const filters = parseSearchQuery(q.trim());

    let authorId: string | undefined;
    if (filters.from) {
      const author = await prisma.user.findUnique({
        where: { username: filters.from },
        select: { id: true },
      });
      if (!author) return reply.send({ results: [] });
      authorId = author.id;
    }

    let channelId: string | null | undefined;
    if (filters.channel === "geral") {
      channelId = null;
    } else if (filters.channel) {
      const channel = await prisma.textChannel.findFirst({
        where: { serverId, name: filters.channel },
        select: { id: true },
      });
      if (!channel) return reply.send({ results: [] });
      channelId = channel.id;
    }

    const and: Record<string, unknown>[] = [];
    const where: Record<string, unknown> = { serverId };
    if (filters.text) and.push({ content: { contains: filters.text, mode: "insensitive" } });
    if (authorId) where.authorId = authorId;
    if (channelId !== undefined) where.channelId = channelId;
    if (channelId === undefined && !canManageServer(member.role)) {
      const channels = await prisma.textChannel.findMany({ where: { serverId }, select: { id: true } });
      const readable = await Promise.all(
        channels.map(async (channel) => ({
          id: channel.id,
          readable: await canReadChannel(sub, serverId, channel.id),
        }))
      );
      where.OR = [
        { channelId: null },
        { channelId: { in: readable.filter((item) => item.readable).map((item) => item.id) } },
      ];
    }
    if (channelId !== undefined && !(await canReadChannel(sub, serverId, channelId))) {
      return reply.status(403).send({ error: "Sem acesso ao canal" });
    }
    if (filters.before || filters.after) {
      const range: { gte?: Date; lte?: Date } = {};
      if (filters.after) range.gte = filters.after;
      if (filters.before) range.lte = filters.before;
      where.createdAt = range;
    }
    if (filters.hasLink) {
      and.push({
        OR: [
          { content: { contains: "http://", mode: "insensitive" } },
          { content: { contains: "https://", mode: "insensitive" } },
          { content: { contains: "www.", mode: "insensitive" } },
        ],
      });
    }
    if (filters.hasImage) {
      and.push({ OR: [
        { content: { contains: ".png", mode: "insensitive" } },
        { content: { contains: ".jpg", mode: "insensitive" } },
        { content: { contains: ".jpeg", mode: "insensitive" } },
        { content: { contains: ".gif", mode: "insensitive" } },
        { content: { contains: ".webp", mode: "insensitive" } },
        { content: { contains: "tenor.com", mode: "insensitive" } },
        { content: { contains: "giphy.com", mode: "insensitive" } },
      ] });
    }
    if (and.length > 0) where.AND = and;

    const results = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { author: { select: { username: true } } },
    });

    return reply.send({
      results: results.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        authorId: m.authorId,
        authorName: m.author.username,
        channelId: m.channelId,
      })),
    });
  });

  // Get LiveKit token for room
  fastify.post("/:serverId/rooms/:roomId/token", async (request, reply) => {
    const { sub, username } = request.user as { sub: string; username: string };
    const { serverId, roomId } = request.params as { serverId: string; roomId: string };

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const room = await prisma.room.findFirst({ where: { id: roomId, serverId } });
    if (!room) return reply.status(404).send({ error: "Sala não encontrada" });

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: sub, name: username }
    );

    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
    });

    return reply.send({ token: await token.toJwt(), url: process.env.LIVEKIT_URL! });
  });
};

export default serversRoutes;
