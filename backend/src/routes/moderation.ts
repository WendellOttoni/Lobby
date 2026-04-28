import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";
import { isOnline, getPresence } from "../services/presence.js";
import { canManageServer, getServerRole } from "../services/permissions.js";
import { recordServerAudit } from "../services/audit.js";

const mutateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

const moderationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

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
};

export default moderationRoutes;
