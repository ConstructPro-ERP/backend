-- DropIndex
DROP INDEX "quotation_projectId_key";

-- CreateIndex
CREATE INDEX "quotation_projectId_idx" ON "quotation"("projectId");
