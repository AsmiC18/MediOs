-- CreateEnum
CREATE TYPE "PatientPrivacyConsentType" AS ENUM ('PATIENT_PRIVACY');

-- CreateEnum
CREATE TYPE "PatientPrivacyPurpose" AS ENUM ('CARE', 'COMMUNICATION', 'DATA_PROCESSING');

-- CreateEnum
CREATE TYPE "PatientPrivacyConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PatientPrivacyErasureStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PatientPrivacyConsent" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consentType" "PatientPrivacyConsentType" NOT NULL DEFAULT 'PATIENT_PRIVACY',
    "purpose" "PatientPrivacyPurpose" NOT NULL,
    "status" "PatientPrivacyConsentStatus" NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1',
    "grantedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "relatedGrantId" TEXT,
    "recordedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPrivacyConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPrivacyErasureRequest" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "PatientPrivacyErasureStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "rejectionReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPrivacyErasureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientPrivacyConsent_hospitalId_idx" ON "PatientPrivacyConsent"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientPrivacyConsent_patientId_idx" ON "PatientPrivacyConsent"("patientId");

-- CreateIndex
CREATE INDEX "PatientPrivacyConsent_hospitalId_patientId_createdAt_idx" ON "PatientPrivacyConsent"("hospitalId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientPrivacyConsent_purpose_idx" ON "PatientPrivacyConsent"("purpose");

-- CreateIndex
CREATE INDEX "PatientPrivacyConsent_status_idx" ON "PatientPrivacyConsent"("status");

-- CreateIndex
CREATE INDEX "PatientPrivacyErasureRequest_hospitalId_idx" ON "PatientPrivacyErasureRequest"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientPrivacyErasureRequest_patientId_idx" ON "PatientPrivacyErasureRequest"("patientId");

-- CreateIndex
CREATE INDEX "PatientPrivacyErasureRequest_hospitalId_patientId_status_idx" ON "PatientPrivacyErasureRequest"("hospitalId", "patientId", "status");

-- CreateIndex
CREATE INDEX "PatientPrivacyErasureRequest_createdAt_idx" ON "PatientPrivacyErasureRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "PatientPrivacyConsent" ADD CONSTRAINT "PatientPrivacyConsent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrivacyConsent" ADD CONSTRAINT "PatientPrivacyConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrivacyConsent" ADD CONSTRAINT "PatientPrivacyConsent_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrivacyConsent" ADD CONSTRAINT "PatientPrivacyConsent_relatedGrantId_fkey" FOREIGN KEY ("relatedGrantId") REFERENCES "PatientPrivacyConsent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrivacyErasureRequest" ADD CONSTRAINT "PatientPrivacyErasureRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrivacyErasureRequest" ADD CONSTRAINT "PatientPrivacyErasureRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrivacyErasureRequest" ADD CONSTRAINT "PatientPrivacyErasureRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrivacyErasureRequest" ADD CONSTRAINT "PatientPrivacyErasureRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
