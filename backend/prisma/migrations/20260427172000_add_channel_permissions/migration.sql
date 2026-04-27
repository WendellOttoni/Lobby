CREATE TABLE "ChannelPermission" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelPermission_channelId_role_key" ON "ChannelPermission"("channelId", "role");
CREATE INDEX "ChannelPermission_serverId_idx" ON "ChannelPermission"("serverId");

ALTER TABLE "ChannelPermission" ADD CONSTRAINT "ChannelPermission_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelPermission" ADD CONSTRAINT "ChannelPermission_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TextChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
