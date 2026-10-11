-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN "billingCatalogueItemId" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN "billingCatalogueCode" TEXT;

-- CreateIndex
CREATE INDEX "InvoiceItem_billingCatalogueItemId_idx" ON "InvoiceItem"("billingCatalogueItemId");

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_billingCatalogueItemId_fkey" FOREIGN KEY ("billingCatalogueItemId") REFERENCES "BillingCatalogueItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
