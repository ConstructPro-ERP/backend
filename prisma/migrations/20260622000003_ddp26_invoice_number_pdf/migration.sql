ALTER TABLE "Invoice"
ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "pdfPath" TEXT,
ADD COLUMN "pdfUrl" TEXT,
ADD COLUMN "pdfGeneratedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");
