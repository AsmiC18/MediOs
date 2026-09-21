-- CreateEnum
CREATE TYPE "InsuranceProviderType" AS ENUM ('INSURANCE', 'TPA');

-- CreateEnum
CREATE TYPE "InsuranceEmpanelmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PatientInsurancePolicyStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InsurancePreAuthorizationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InsuranceClaimStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "InsuranceProvider" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "providerType" "InsuranceProviderType" NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceEmpanelment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "InsuranceEmpanelmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceEmpanelment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientInsurancePolicy" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "memberId" TEXT,
    "groupNumber" TEXT,
    "planName" TEXT,
    "coverageStartDate" TIMESTAMP(3),
    "coverageEndDate" TIMESTAMP(3),
    "sumInsured" DECIMAL(12,2),
    "status" "PatientInsurancePolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientInsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePreAuthorization" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "admissionId" TEXT,
    "encounterId" TEXT,
    "requestedAmount" DECIMAL(12,2) NOT NULL,
    "approvedAmount" DECIMAL(12,2),
    "status" "InsurancePreAuthorizationStatus" NOT NULL DEFAULT 'DRAFT',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionDate" TIMESTAMP(3),
    "authorizationNumber" TEXT,
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePreAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "preAuthorizationId" TEXT,
    "claimNumber" TEXT NOT NULL,
    "claimedAmount" DECIMAL(12,2) NOT NULL,
    "approvedAmount" DECIMAL(12,2),
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "patientResponsibility" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "InsuranceClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsuranceProvider_hospitalId_idx" ON "InsuranceProvider"("hospitalId");

-- CreateIndex
CREATE INDEX "InsuranceProvider_providerType_idx" ON "InsuranceProvider"("providerType");

-- CreateIndex
CREATE INDEX "InsuranceProvider_isActive_idx" ON "InsuranceProvider"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceProvider_hospitalId_code_key" ON "InsuranceProvider"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "InsuranceEmpanelment_hospitalId_idx" ON "InsuranceEmpanelment"("hospitalId");

-- CreateIndex
CREATE INDEX "InsuranceEmpanelment_providerId_idx" ON "InsuranceEmpanelment"("providerId");

-- CreateIndex
CREATE INDEX "InsuranceEmpanelment_status_idx" ON "InsuranceEmpanelment"("status");

-- CreateIndex
CREATE INDEX "InsuranceEmpanelment_effectiveFrom_idx" ON "InsuranceEmpanelment"("effectiveFrom");

-- CreateIndex
CREATE INDEX "PatientInsurancePolicy_hospitalId_idx" ON "PatientInsurancePolicy"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientInsurancePolicy_patientId_idx" ON "PatientInsurancePolicy"("patientId");

-- CreateIndex
CREATE INDEX "PatientInsurancePolicy_providerId_idx" ON "PatientInsurancePolicy"("providerId");

-- CreateIndex
CREATE INDEX "PatientInsurancePolicy_status_idx" ON "PatientInsurancePolicy"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PatientInsurancePolicy_hospitalId_policyNumber_key" ON "PatientInsurancePolicy"("hospitalId", "policyNumber");

-- CreateIndex
CREATE INDEX "InsurancePreAuthorization_hospitalId_idx" ON "InsurancePreAuthorization"("hospitalId");

-- CreateIndex
CREATE INDEX "InsurancePreAuthorization_branchId_idx" ON "InsurancePreAuthorization"("branchId");

-- CreateIndex
CREATE INDEX "InsurancePreAuthorization_patientId_idx" ON "InsurancePreAuthorization"("patientId");

-- CreateIndex
CREATE INDEX "InsurancePreAuthorization_policyId_idx" ON "InsurancePreAuthorization"("policyId");

-- CreateIndex
CREATE INDEX "InsurancePreAuthorization_providerId_idx" ON "InsurancePreAuthorization"("providerId");

-- CreateIndex
CREATE INDEX "InsurancePreAuthorization_status_idx" ON "InsurancePreAuthorization"("status");

-- CreateIndex
CREATE INDEX "InsurancePreAuthorization_requestDate_idx" ON "InsurancePreAuthorization"("requestDate");

-- CreateIndex
CREATE INDEX "InsuranceClaim_hospitalId_idx" ON "InsuranceClaim"("hospitalId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_branchId_idx" ON "InsuranceClaim"("branchId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_patientId_idx" ON "InsuranceClaim"("patientId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_policyId_idx" ON "InsuranceClaim"("policyId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_providerId_idx" ON "InsuranceClaim"("providerId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_invoiceId_idx" ON "InsuranceClaim"("invoiceId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_status_idx" ON "InsuranceClaim"("status");

-- CreateIndex
CREATE INDEX "InsuranceClaim_submittedAt_idx" ON "InsuranceClaim"("submittedAt");

-- CreateIndex
CREATE INDEX "InsuranceClaim_createdAt_idx" ON "InsuranceClaim"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_hospitalId_claimNumber_key" ON "InsuranceClaim"("hospitalId", "claimNumber");

-- AddForeignKey
ALTER TABLE "InsuranceProvider" ADD CONSTRAINT "InsuranceProvider_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceEmpanelment" ADD CONSTRAINT "InsuranceEmpanelment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceEmpanelment" ADD CONSTRAINT "InsuranceEmpanelment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurancePolicy" ADD CONSTRAINT "PatientInsurancePolicy_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurancePolicy" ADD CONSTRAINT "PatientInsurancePolicy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurancePolicy" ADD CONSTRAINT "PatientInsurancePolicy_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PatientInsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "IpdAdmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PatientInsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_preAuthorizationId_fkey" FOREIGN KEY ("preAuthorizationId") REFERENCES "InsurancePreAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
