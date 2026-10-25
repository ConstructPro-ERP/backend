-- DDP-23: invoice CRUD and project invoice generation.
-- Keep existing data while aligning the status vocabulary with the finance SRS.
ALTER TYPE "InvoiceStatus" RENAME VALUE 'SENT' TO 'ISSUED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';

ALTER TABLE "Invoice"
  ALTER COLUMN "totalAmount" TYPE DECIMAL(12,2)
    USING ROUND("totalAmount"::numeric, 2),
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "createdBy" TEXT,
  ADD COLUMN "updatedBy" TEXT;

CREATE INDEX "Invoice_projectId_idx" ON "Invoice"("projectId");
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
