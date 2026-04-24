-- User.statusText
ALTER TABLE "User" ADD COLUMN "statusText" VARCHAR(128);

-- TextChannel
CREATE TABLE "TextChannel" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "serverId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TextChannel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TextChannel_serverId_idx" ON "TextChannel"("serverId");
ALTER TABLE "TextChannel"
  ADD CONSTRAINT "TextChannel_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Message.channelId + replyToId
ALTER TABLE "Message" ADD COLUMN "channelId" TEXT;
ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT;
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "TextChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_replyToId_fkey"
    FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MessagePin
CREATE TABLE "MessagePin" (
  "id"        TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "serverId"  TEXT NOT NULL,
  "channelId" TEXT,
  "pinnedBy"  TEXT NOT NULL,
  "pinnedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessagePin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessagePin_messageId_key" ON "MessagePin"("messageId");
CREATE INDEX "MessagePin_serverId_idx" ON "MessagePin"("serverId");
ALTER TABLE "MessagePin"
  ADD CONSTRAINT "MessagePin_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagePin"
  ADD CONSTRAINT "MessagePin_pinnedBy_fkey"
    FOREIGN KEY ("pinnedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
