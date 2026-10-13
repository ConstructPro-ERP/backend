/*
  Warnings:

  - A unique constraint covering the columns `[cloudinaryPublicId]` on the table `Document` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cloudinaryPublicId` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cloudinaryResourceType` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileSize` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mimeType` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalName` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DocumentStorageStatus" AS ENUM ('PENDING', 'ACTIVE', 'DELETING', 'FAILED', 'DELETED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "cloudinaryPublicId" TEXT NOT NULL,
ADD COLUMN     "cloudinaryResourceType" TEXT NOT NULL,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "fileSize" INTEGER NOT NULL,
ADD COLUMN     "mimeType" TEXT NOT NULL,
ADD COLUMN     "originalName" TEXT NOT NULL,
ADD COLUMN     "storageProvider" TEXT NOT NULL DEFAULT 'CLOUDINARY',
ADD COLUMN     "storageStatus" "DocumentStorageStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "fileUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DocumentCategory" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Document_cloudinaryPublicId_key" ON "Document"("cloudinaryPublicId");

-- CreateIndex
CREATE INDEX "Document_projectId_deletedAt_storageStatus_createdAt_idx" ON "Document"("projectId", "deletedAt", "storageStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Document_projectId_categoryId_deletedAt_idx" ON "Document"("projectId", "categoryId", "deletedAt");

-- CreateIndex
CREATE INDEX "Document_categoryId_idx" ON "Document"("categoryId");

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");
