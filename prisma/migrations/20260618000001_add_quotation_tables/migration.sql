-- AlterEnum
ALTER TYPE "QuotationStatus" ADD VALUE 'CONVERTED';

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_quotationId_fkey";

-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_customerId_fkey";

-- DropForeignKey
ALTER TABLE "QuotationItem" DROP CONSTRAINT "QuotationItem_quotationId_fkey";

-- DropIndex
DROP INDEX "Project_quotationId_key";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "quotationId";

-- DropTable
DROP TABLE "Quotation";

-- DropTable
DROP TABLE "QuotationItem";

-- CreateTable
CREATE TABLE "quotation" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "quotationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "QuotationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "pdfUrl" TEXT,
    "notes" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_item" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "quotation_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotation_projectId_key" ON "quotation"("projectId");

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_item" ADD CONSTRAINT "quotation_item_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
