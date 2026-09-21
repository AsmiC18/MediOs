-- CreateEnum
CREATE TYPE "GstSupplyType" AS ENUM ('INTRA_STATE', 'INTER_STATE');

-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "stateCode" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "placeOfSupplyStateCode" TEXT,
ADD COLUMN     "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "supplierGstin" TEXT,
ADD COLUMN     "supplierStateCode" TEXT,
ADD COLUMN     "supplyType" "GstSupplyType";

-- AlterTable: add GST columns to InvoiceItem (nullable first for backfill)
ALTER TABLE "InvoiceItem" ADD COLUMN     "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hsnSac" TEXT,
ADD COLUMN     "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineTotalWithTax" DECIMAL(12,2),
ADD COLUMN     "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableAmount" DECIMAL(12,2);

-- Backfill existing invoice items
UPDATE "InvoiceItem"
SET
  "taxableAmount" = "lineTotal",
  "lineTotalWithTax" = "lineTotal",
  "gstRate" = 0,
  "cgstRate" = 0,
  "cgstAmount" = 0,
  "sgstRate" = 0,
  "sgstAmount" = 0,
  "igstRate" = 0,
  "igstAmount" = 0
WHERE "taxableAmount" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "InvoiceItem"
ALTER COLUMN "taxableAmount" SET NOT NULL,
ALTER COLUMN "lineTotalWithTax" SET NOT NULL;
