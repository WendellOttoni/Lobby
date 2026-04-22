CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Message_serverId_createdAt_idx" ON "Message"("serverId", "createdAt");
