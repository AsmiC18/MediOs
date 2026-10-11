-- CreateEnum
CREATE TYPE "DiagnosticAggregatorSubmissionStatus" AS ENUM ('NONE', 'MANUAL_REQUIRED', 'EXTERNAL_SUBMITTED');

-- AlterTable
ALTER TABLE "DiagnosticOrder" ADD COLUMN "aggregatorSubmissionStatus" "DiagnosticAggregatorSubmissionStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "DiagnosticOrder" ADD COLUMN "aggregatorExternalReference" TEXT;
ALTER TABLE "DiagnosticOrder" ADD COLUMN "aggregatorSubmittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DiagnosticOrder_aggregatorSubmissionStatus_idx" ON "DiagnosticOrder"("aggregatorSubmissionStatus");
