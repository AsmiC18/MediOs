-- CreateEnum
CREATE TYPE "PatientAtRiskStatus" AS ENUM ('INSUFFICIENT_HISTORY', 'NOT_AT_RISK', 'AT_RISK');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "atRiskEvaluatedAt" TIMESTAMP(3),
ADD COLUMN     "atRiskStatus" "PatientAtRiskStatus",
ADD COLUMN     "averageVisitCadenceDays" DOUBLE PRECISION,
ADD COLUMN     "chronicConditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "daysSinceLastVisit" INTEGER,
ADD COLUMN     "emergencyContacts" JSONB,
ADD COLUMN     "isAtRisk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mergedAt" TIMESTAMP(3),
ADD COLUMN     "mergedByUserId" TEXT,
ADD COLUMN     "mergedIntoPatientId" TEXT,
ADD COLUMN     "suggestedAction" TEXT;

-- CreateTable
CREATE TABLE "PatientFieldHistory" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientFieldHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientFieldHistory_hospitalId_idx" ON "PatientFieldHistory"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientFieldHistory_patientId_idx" ON "PatientFieldHistory"("patientId");

-- CreateIndex
CREATE INDEX "PatientFieldHistory_changedByUserId_idx" ON "PatientFieldHistory"("changedByUserId");

-- CreateIndex
CREATE INDEX "PatientFieldHistory_changedAt_idx" ON "PatientFieldHistory"("changedAt");

-- CreateIndex
CREATE INDEX "Patient_mergedIntoPatientId_idx" ON "Patient"("mergedIntoPatientId");

-- CreateIndex
CREATE INDEX "Patient_isAtRisk_idx" ON "Patient"("isAtRisk");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedIntoPatientId_fkey" FOREIGN KEY ("mergedIntoPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedByUserId_fkey" FOREIGN KEY ("mergedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFieldHistory" ADD CONSTRAINT "PatientFieldHistory_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFieldHistory" ADD CONSTRAINT "PatientFieldHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFieldHistory" ADD CONSTRAINT "PatientFieldHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
