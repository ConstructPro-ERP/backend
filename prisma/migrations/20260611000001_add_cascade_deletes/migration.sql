-- RefreshToken.userId: RESTRICT → CASCADE
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Customer.leadId: SET NULL → CASCADE
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_leadId_fkey";
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- QuotationItem.quotationId: RESTRICT → CASCADE
ALTER TABLE "QuotationItem" DROP CONSTRAINT "QuotationItem_quotationId_fkey";
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey"
  FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
