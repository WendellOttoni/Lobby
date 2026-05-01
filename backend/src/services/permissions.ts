import prisma from "../db/client.js";

const MANAGE_ROLES = new Set(["owner", "admin"]);

export function canManageServer(role?: string | null): boolean {
  return !!role && MANAGE_ROLES.has(role);
}

export async function getServerRole(userId: string, serverId: string): Promise<string | null> {
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

function bypassChannelPermission(role?: string | null) {
  return canManageServer(role);
}

export async function canReadChannel(userId: string, serverId: string, channelId: string | null): Promise<boolean> {
  if (!channelId) return !!(await getServerRole(userId, serverId));
  const role = await getServerRole(userId, serverId);
  if (!role) return false;
  if (bypassChannelPermission(role)) return true;
  const permission = await prisma.channelPermission.findUnique({
    where: { channelId_role: { channelId, role } },
    select: { canRead: true },
  });
  return permission?.canRead ?? true;
}

export async function canWriteChannel(userId: string, serverId: string, channelId: string | null): Promise<boolean> {
  if (!channelId) return !!(await getServerRole(userId, serverId));
  const role = await getServerRole(userId, serverId);
  if (!role) return false;
  if (bypassChannelPermission(role)) return true;
  const permission = await prisma.channelPermission.findUnique({
    where: { channelId_role: { channelId, role } },
    select: { canRead: true, canWrite: true },
  });
  return (permission?.canRead ?? true) && (permission?.canWrite ?? true);
}

export async function canReactChannel(userId: string, serverId: string, channelId: string | null): Promise<boolean> {
  if (!channelId) return !!(await getServerRole(userId, serverId));
  const role = await getServerRole(userId, serverId);
  if (!role) return false;
  if (bypassChannelPermission(role)) return true;
  const permission = await prisma.channelPermission.findUnique({
    where: { channelId_role: { channelId, role } },
    select: { canRead: true, canReact: true },
  });
  return (permission?.canRead ?? true) && (permission?.canReact ?? true);
}
