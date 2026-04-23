-- Add lastReadAt to ServerMember for unread message tracking
ALTER TABLE "ServerMember" ADD COLUMN "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
