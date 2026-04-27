import type { Prisma } from "@prisma/client";
import prisma from "../db/client.js";

interface AuditOptions {
  targetId?: string | null;
  targetType?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export async function recordServerAudit(
  serverId: string,
  actorId: string,
  action: string,
  options: AuditOptions = {}
) {
  await prisma.serverAuditLog
    .create({
      data: {
        serverId,
        actorId,
        action,
        targetId: options.targetId ?? null,
        targetType: options.targetType ?? null,
        metadata: options.metadata ?? undefined,
      },
    })
    .catch(() => undefined);
}
