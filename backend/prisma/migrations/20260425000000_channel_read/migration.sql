CREATE TABLE "ChannelRead" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "channelId"  TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChannelRead_userId_channelId_key" ON "ChannelRead"("userId", "channelId");
CREATE INDEX "ChannelRead_channelId_idx" ON "ChannelRead"("channelId");
ALTER TABLE "ChannelRead"
  ADD CONSTRAINT "ChannelRead_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelRead"
  ADD CONSTRAINT "ChannelRead_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "TextChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
