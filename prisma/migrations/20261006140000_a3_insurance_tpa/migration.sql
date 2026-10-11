-- CreateEnum
CREATE TYPE "InsuranceCopayType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "InsuranceClaimExternalSubmissionStatus" AS ENUM ('NONE', 'MANUAL_REQUIRED', 'MANUAL_SUBMITTED');

-- AlterTable
ALTER TABLE "InsuranceEmpanelment" ADD COLUMN "branchId" TEXT;

-- AlterTable
ALTER TABLE "PatientInsurancePolicy" ADD COLUMN "copayType" "InsuranceCopayType",
ADD COLUMN "copayValue" DECIMAL(12,2),
ADD COLUMN "empanelmentId" TEXT;

-- AlterTable
ALTER TABLE "InsurancePreAuthorization" ADD COLUMN "empanelmentId" TEXT,
ADD COLUMN "packageId" TEXT,
ADD COLUMN "serviceCode" TEXT;

-- AlterTable
ALTER TABLE "InsuranceClaim" ADD COLUMN "payerResponsibility" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "externalSubmissionStatus" "InsuranceClaimExternalSubmissionStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "empanelmentId" TEXT,
ADD COLUMN "packageId" TEXT,
ADD COLUMN "previousClaimId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "insurancePatientResponsibilityAmount" DECIMAL(12,2),
ADD COLUMN "insurancePayerResponsibilityAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "InsurancePackage" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "empanelmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePackageRate" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePackageRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsuranceEmpanelment_branchId_idx" ON "InsuranceEmpanelment"("branchId");

-- CreateIndex
CREATE INDEX "PatientInsurancePolicy_empanelmentId_idx" ON "PatientInsurancePolicy"("empanelmentId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_empanelmentId_idx" ON "InsuranceClaim"("empanelmentId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_packageId_idx" ON "InsuranceClaim"("packageId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_previousClaimId_idx" ON "InsuranceClaim"("previousClaimId");

-- CreateIndex
CREATE UNIQUE INDEX "InsurancePackage_hospitalId_empanelmentId_code_key" ON "InsurancePackage"("hospitalId", "empanelmentId", "code");

-- CreateIndex
CREATE INDEX "InsurancePackage_hospitalId_idx" ON "InsurancePackage"("hospitalId");

-- CreateIndex
CREATE INDEX "InsurancePackage_providerId_idx" ON "InsurancePackage"("providerId");

-- CreateIndex
CREATE INDEX "InsurancePackage_empanelmentId_idx" ON "InsurancePackage"("empanelmentId");

-- CreateIndex
CREATE INDEX "InsurancePackage_isActive_idx" ON "InsurancePackage"("isActive");

-- CreateIndex
CREATE INDEX "InsurancePackageRate_packageId_idx" ON "InsurancePackageRate"("packageId");

-- CreateIndex
CREATE INDEX "InsurancePackageRate_hospitalId_idx" ON "InsurancePackageRate"("hospitalId");

-- CreateIndex
CREATE INDEX "InsurancePackageRate_serviceCode_idx" ON "InsurancePackageRate"("serviceCode");

-- CreateIndex
CREATE INDEX "InsurancePackageRate_effectiveFrom_idx" ON "InsurancePackageRate"("effectiveFrom");

-- AddForeignKey
ALTER TABLE "InsuranceEmpanelment" ADD CONSTRAINT "InsuranceEmpanelment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePackage" ADD CONSTRAINT "InsurancePackage_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePackage" ADD CONSTRAINT "InsurancePackage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePackage" ADD CONSTRAINT "InsurancePackage_empanelmentId_fkey" FOREIGN KEY ("empanelmentId") REFERENCES "InsuranceEmpanelment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePackageRate" ADD CONSTRAINT "InsurancePackageRate_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "InsurancePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePackageRate" ADD CONSTRAINT "InsurancePackageRate_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurancePolicy" ADD CONSTRAINT "PatientInsurancePolicy_empanelmentId_fkey" FOREIGN KEY ("empanelmentId") REFERENCES "InsuranceEmpanelment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_empanelmentId_fkey" FOREIGN KEY ("empanelmentId") REFERENCES "InsuranceEmpanelment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "InsurancePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_empanelmentId_fkey" FOREIGN KEY ("empanelmentId") REFERENCES "InsuranceEmpanelment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "InsurancePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_previousClaimId_fkey" FOREIGN KEY ("previousClaimId") REFERENCES "InsuranceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
