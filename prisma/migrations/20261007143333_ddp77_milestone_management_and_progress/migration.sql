/*
  Warnings:

  - Added the required column `weight` to the `Milestone` table without a default value. This is not possible if the table is not empty.

*/

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "progressPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "progressPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");
