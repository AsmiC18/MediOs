-- CreateEnum
CREATE TYPE "PatientPortalAccountStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateTable
CREATE TABLE "PatientPortalAccount" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "PatientPortalAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPortalSession" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "replacedBySessionId" TEXT,
    "familyId" TEXT NOT NULL,
    "revokeReason" TEXT,

    CONSTRAINT "PatientPortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalAccount_patientId_key" ON "PatientPortalAccount"("patientId");

-- CreateIndex
CREATE INDEX "PatientPortalAccount_hospitalId_idx" ON "PatientPortalAccount"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientPortalAccount_hospitalId_status_idx" ON "PatientPortalAccount"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalSession_refreshTokenHash_key" ON "PatientPortalSession"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalSession_replacedBySessionId_key" ON "PatientPortalSession"("replacedBySessionId");

-- CreateIndex
CREATE INDEX "PatientPortalSession_patientId_revokedAt_idx" ON "PatientPortalSession"("patientId", "revokedAt");

-- CreateIndex
CREATE INDEX "PatientPortalSession_hospitalId_patientId_idx" ON "PatientPortalSession"("hospitalId", "patientId");

-- CreateIndex
CREATE INDEX "PatientPortalSession_familyId_idx" ON "PatientPortalSession"("familyId");

-- AddForeignKey
ALTER TABLE "PatientPortalAccount" ADD CONSTRAINT "PatientPortalAccount_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalAccount" ADD CONSTRAINT "PatientPortalAccount_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalSession" ADD CONSTRAINT "PatientPortalSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalSession" ADD CONSTRAINT "PatientPortalSession_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalSession" ADD CONSTRAINT "PatientPortalSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalSession" ADD CONSTRAINT "PatientPortalSession_replacedBySessionId_fkey" FOREIGN KEY ("replacedBySessionId") REFERENCES "PatientPortalSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
