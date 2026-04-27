CREATE TABLE "ServerAuditLog" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "targetId" VARCHAR(128),
    "targetType" VARCHAR(64),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerAuditLog_serverId_createdAt_idx" ON "ServerAuditLog"("serverId", "createdAt");
CREATE INDEX "ServerAuditLog_actorId_idx" ON "ServerAuditLog"("actorId");

ALTER TABLE "ServerAuditLog" ADD CONSTRAINT "ServerAuditLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerAuditLog" ADD CONSTRAINT "ServerAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
