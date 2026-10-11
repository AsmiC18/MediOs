-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN "emergencyVisitFeeUnitPrice" DECIMAL(12,2);
ALTER TABLE "Hospital" ADD COLUMN "emergencyVisitFeeHsnSac" TEXT;
ALTER TABLE "Hospital" ADD COLUMN "emergencyVisitFeeGstRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "Hospital" ADD COLUMN "ipdDischargeFeeUnitPrice" DECIMAL(12,2);
ALTER TABLE "Hospital" ADD COLUMN "ipdDischargeFeeHsnSac" TEXT;
ALTER TABLE "Hospital" ADD COLUMN "ipdDischargeFeeGstRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "Hospital" ADD COLUMN "surgeryProcedureFeeUnitPrice" DECIMAL(12,2);
ALTER TABLE "Hospital" ADD COLUMN "surgeryProcedureFeeHsnSac" TEXT;
ALTER TABLE "Hospital" ADD COLUMN "surgeryProcedureFeeGstRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "DiagnosticOrderItem" ADD COLUMN "billableUnitPrice" DECIMAL(12,2);
ALTER TABLE "DiagnosticOrderItem" ADD COLUMN "billableHsnSac" TEXT;
ALTER TABLE "DiagnosticOrderItem" ADD COLUMN "billableGstRate" DECIMAL(5,2);
