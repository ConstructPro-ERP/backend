-- DDP-24: payment tracking and persisted invoice balances.
ALTER TABLE "Invoice"
  ADD COLUMN "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "outstandingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Payment"
  ALTER COLUMN "amount" TYPE DECIMAL(12,2)
    USING ROUND("amount"::numeric, 2),
  ADD COLUMN "referenceNumber" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "createdBy" TEXT;

-- Preserve legacy payments while making every future reference unique and required.
UPDATE "Payment"
SET "referenceNumber" = 'LEGACY-' || "id"
WHERE "referenceNumber" IS NULL;

ALTER TABLE "Payment"
  ALTER COLUMN "referenceNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Payment_referenceNumber_key"
  ON "Payment"("referenceNumber");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");

-- Backfill balances from any existing payment history.
WITH payment_totals AS (
  SELECT "invoiceId", COALESCE(SUM("amount"), 0) AS paid
  FROM "Payment"
  WHERE "invoiceId" IS NOT NULL
  GROUP BY "invoiceId"
)
UPDATE "Invoice" AS invoice
SET
  "paidAmount" = LEAST(invoice."totalAmount", totals.paid),
  "outstandingAmount" = GREATEST(invoice."totalAmount" - totals.paid, 0)
FROM payment_totals AS totals
WHERE invoice."id" = totals."invoiceId";

UPDATE "Invoice"
SET "outstandingAmount" = "totalAmount"
WHERE "paidAmount" = 0;

UPDATE "Invoice"
SET "status" = CASE
  WHEN "paidAmount" >= "totalAmount" THEN 'PAID'::"InvoiceStatus"
  WHEN "paidAmount" > 0 THEN 'PARTIALLY_PAID'::"InvoiceStatus"
  ELSE "status"
END
WHERE "status" <> 'CANCELLED';
