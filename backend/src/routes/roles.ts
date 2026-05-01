import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";
import { canManageServer, getServerRole } from "../services/permissions.js";

const mutateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

const rolesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/:serverId/roles", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });

    const roles = await prisma.serverRole.findMany({
      where: { serverId },
      orderBy: { position: "asc" },
    });

    // return defaults for built-in roles not yet in DB
    const defaultRoles = ["owner", "admin", "member"];
    const existingNames = new Set(roles.map((r) => r.name));
    const merged = [
      ...defaultRoles
        .filter((n) => !existingNames.has(n))
        .map((n, i) => ({ id: n, serverId, name: n, color: null, position: i })),
      ...roles,
    ];

    return reply.send({ roles: merged });
  });

  fastify.put("/:serverId/roles/:roleName", { config: mutateLimit }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId, roleName } = request.params as { serverId: string; roleName: string };
    const { color } = (request.body ?? {}) as { color?: string | null };

    const role = await getServerRole(sub, serverId);
    if (!role) return reply.status(403).send({ error: "Sem acesso" });
    if (!canManageServer(role)) return reply.status(403).send({ error: "Sem permissão para editar cargos" });

    const validRoles = ["owner", "admin", "member"];
    if (!validRoles.includes(roleName)) return reply.status(400).send({ error: "Cargo inválido" });

    if (color !== undefined && color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return reply.status(400).send({ error: "Cor inválida (use #rrggbb)" });
    }

    const positionMap: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    const updated = await prisma.serverRole.upsert({
      where: { serverId_name: { serverId, name: roleName } },
      create: { serverId, name: roleName, color: color ?? null, position: positionMap[roleName] ?? 99 },
      update: { color: color ?? null },
    });

    return reply.send({ role: updated });
  });
};

export default rolesRoutes;
