-- CreateEnum
CREATE TYPE "AbdmEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "AbdmRegistrationStatus" AS ENUM ('NOT_REGISTERED', 'PENDING', 'REGISTERED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AbhaLinkStatus" AS ENUM ('UNLINKED', 'LINK_PENDING', 'LINKED', 'VERIFICATION_FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AbdmConsentStatus" AS ENUM ('DRAFT', 'REQUESTED', 'GRANTED', 'DENIED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AbdmConsentAuditAction" AS ENUM ('CREATED', 'STATUS_CHANGED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "AbdmHospitalConfig" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "hfrId" TEXT,
    "hipId" TEXT,
    "hiuId" TEXT,
    "hfrStatus" "AbdmRegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "hipStatus" "AbdmRegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "registeredAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbdmHospitalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbdmProfessionalLink" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hprId" TEXT,
    "linkStatus" "AbdmRegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbdmProfessionalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAbhaLink" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "abhaNumber" TEXT,
    "abhaAddress" TEXT,
    "linkStatus" "AbhaLinkStatus" NOT NULL DEFAULT 'UNLINKED',
    "linkedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "providerReferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAbhaLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbdmConsent" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "consentRequestId" TEXT,
    "purpose" TEXT NOT NULL,
    "hiTypes" TEXT[],
    "status" "AbdmConsentStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "deniedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbdmConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbdmConsentAuditLog" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "action" "AbdmConsentAuditAction" NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbdmConsentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbdmHospitalConfig_hospitalId_key" ON "AbdmHospitalConfig"("hospitalId");

-- CreateIndex
CREATE INDEX "AbdmHospitalConfig_hospitalId_idx" ON "AbdmHospitalConfig"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "AbdmProfessionalLink_userId_key" ON "AbdmProfessionalLink"("userId");

-- CreateIndex
CREATE INDEX "AbdmProfessionalLink_hospitalId_idx" ON "AbdmProfessionalLink"("hospitalId");

-- CreateIndex
CREATE INDEX "AbdmProfessionalLink_userId_idx" ON "AbdmProfessionalLink"("userId");

-- CreateIndex
CREATE INDEX "AbdmProfessionalLink_linkStatus_idx" ON "AbdmProfessionalLink"("linkStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AbdmProfessionalLink_hospitalId_userId_key" ON "AbdmProfessionalLink"("hospitalId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAbhaLink_patientId_key" ON "PatientAbhaLink"("patientId");

-- CreateIndex
CREATE INDEX "PatientAbhaLink_hospitalId_idx" ON "PatientAbhaLink"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientAbhaLink_patientId_idx" ON "PatientAbhaLink"("patientId");

-- CreateIndex
CREATE INDEX "PatientAbhaLink_linkStatus_idx" ON "PatientAbhaLink"("linkStatus");

-- CreateIndex
CREATE INDEX "AbdmConsent_hospitalId_idx" ON "AbdmConsent"("hospitalId");

-- CreateIndex
CREATE INDEX "AbdmConsent_branchId_idx" ON "AbdmConsent"("branchId");

-- CreateIndex
CREATE INDEX "AbdmConsent_patientId_idx" ON "AbdmConsent"("patientId");

-- CreateIndex
CREATE INDEX "AbdmConsent_status_idx" ON "AbdmConsent"("status");

-- CreateIndex
CREATE INDEX "AbdmConsent_consentRequestId_idx" ON "AbdmConsent"("consentRequestId");

-- CreateIndex
CREATE INDEX "AbdmConsent_createdAt_idx" ON "AbdmConsent"("createdAt");

-- CreateIndex
CREATE INDEX "AbdmConsentAuditLog_hospitalId_idx" ON "AbdmConsentAuditLog"("hospitalId");

-- CreateIndex
CREATE INDEX "AbdmConsentAuditLog_consentId_idx" ON "AbdmConsentAuditLog"("consentId");

-- CreateIndex
CREATE INDEX "AbdmConsentAuditLog_actorUserId_idx" ON "AbdmConsentAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AbdmConsentAuditLog_createdAt_idx" ON "AbdmConsentAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AbdmHospitalConfig" ADD CONSTRAINT "AbdmHospitalConfig_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbdmProfessionalLink" ADD CONSTRAINT "AbdmProfessionalLink_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbdmProfessionalLink" ADD CONSTRAINT "AbdmProfessionalLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAbhaLink" ADD CONSTRAINT "PatientAbhaLink_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAbhaLink" ADD CONSTRAINT "PatientAbhaLink_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbdmConsent" ADD CONSTRAINT "AbdmConsent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbdmConsent" ADD CONSTRAINT "AbdmConsent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbdmConsent" ADD CONSTRAINT "AbdmConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbdmConsent" ADD CONSTRAINT "AbdmConsent_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbdmConsentAuditLog" ADD CONSTRAINT "AbdmConsentAuditLog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbdmConsentAuditLog" ADD CONSTRAINT "AbdmConsentAuditLog_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "AbdmConsent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbdmConsentAuditLog" ADD CONSTRAINT "AbdmConsentAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
