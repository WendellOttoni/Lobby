-- CreateTable Server
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable ServerMember
CREATE TABLE "ServerMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerMember_pkey" PRIMARY KEY ("id")
);

-- AlterTable Room: add serverId nullable first
ALTER TABLE "Room" ADD COLUMN "serverId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Server_inviteCode_key" ON "Server"("inviteCode");
CREATE UNIQUE INDEX "ServerMember_userId_serverId_key" ON "ServerMember"("userId", "serverId");

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerMember" ADD CONSTRAINT "ServerMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerMember" ADD CONSTRAINT "ServerMember_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: create default server and migrate existing data
DO $$
DECLARE
  v_owner_id TEXT;
  v_server_id TEXT;
BEGIN
  SELECT id INTO v_owner_id FROM "User" ORDER BY "createdAt" ASC LIMIT 1;

  IF v_owner_id IS NOT NULL THEN
    v_server_id := replace(gen_random_uuid()::text, '-', '');

    INSERT INTO "Server" ("id", "name", "inviteCode", "ownerId", "createdAt")
    VALUES (
      v_server_id,
      'Lobby',
      substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8),
      v_owner_id,
      NOW()
    );

    UPDATE "Room" SET "serverId" = v_server_id;

    INSERT INTO "ServerMember" ("id", "userId", "serverId", "role", "joinedAt")
    SELECT
      replace(gen_random_uuid()::text, '-', ''),
      u.id,
      v_server_id,
      CASE WHEN u.id = v_owner_id THEN 'owner' ELSE 'member' END,
      NOW()
    FROM "User" u;
  END IF;
END $$;

-- Make serverId NOT NULL
ALTER TABLE "Room" ALTER COLUMN "serverId" SET NOT NULL;
