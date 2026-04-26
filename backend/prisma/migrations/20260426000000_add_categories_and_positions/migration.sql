-- AlterTable
ALTER TABLE "TextChannel" ADD COLUMN "categoryId" TEXT,
                          ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN "categoryId" TEXT,
                   ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "serverId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_serverId_idx" ON "Category"("serverId");

-- CreateIndex
CREATE INDEX "TextChannel_categoryId_idx" ON "TextChannel"("categoryId");

-- CreateIndex
CREATE INDEX "Room_categoryId_idx" ON "Room"("categoryId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextChannel" ADD CONSTRAINT "TextChannel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
