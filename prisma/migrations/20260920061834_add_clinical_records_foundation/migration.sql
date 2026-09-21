-- CreateEnum
CREATE TYPE "ClinicalEncounterType" AS ENUM ('OPD', 'IPD', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ClinicalEncounterStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClinicalDiagnosisType" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ClinicalEncounter" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "ipdAdmissionId" TEXT,
    "providerUserId" TEXT NOT NULL,
    "encounterType" "ClinicalEncounterType" NOT NULL,
    "status" "ClinicalEncounterStatus" NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalSoapNote" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalSoapNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDiagnosis" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "diagnosisType" "ClinicalDiagnosisType" NOT NULL DEFAULT 'SECONDARY',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescribedByUserId" TEXT NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosage" TEXT,
    "route" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "instructions" TEXT,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalEncounter_hospitalId_idx" ON "ClinicalEncounter"("hospitalId");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_branchId_idx" ON "ClinicalEncounter"("branchId");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_patientId_idx" ON "ClinicalEncounter"("patientId");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_appointmentId_idx" ON "ClinicalEncounter"("appointmentId");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_ipdAdmissionId_idx" ON "ClinicalEncounter"("ipdAdmissionId");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_providerUserId_idx" ON "ClinicalEncounter"("providerUserId");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_status_idx" ON "ClinicalEncounter"("status");

-- CreateIndex
CREATE INDEX "ClinicalEncounter_encounterType_idx" ON "ClinicalEncounter"("encounterType");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalSoapNote_encounterId_key" ON "ClinicalSoapNote"("encounterId");

-- CreateIndex
CREATE INDEX "ClinicalSoapNote_hospitalId_idx" ON "ClinicalSoapNote"("hospitalId");

-- CreateIndex
CREATE INDEX "ClinicalDiagnosis_hospitalId_idx" ON "ClinicalDiagnosis"("hospitalId");

-- CreateIndex
CREATE INDEX "ClinicalDiagnosis_encounterId_idx" ON "ClinicalDiagnosis"("encounterId");

-- CreateIndex
CREATE INDEX "ClinicalDiagnosis_code_idx" ON "ClinicalDiagnosis"("code");

-- CreateIndex
CREATE INDEX "Prescription_hospitalId_idx" ON "Prescription"("hospitalId");

-- CreateIndex
CREATE INDEX "Prescription_encounterId_idx" ON "Prescription"("encounterId");

-- CreateIndex
CREATE INDEX "Prescription_patientId_idx" ON "Prescription"("patientId");

-- CreateIndex
CREATE INDEX "Prescription_status_idx" ON "Prescription"("status");

-- CreateIndex
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "PrescriptionItem"("prescriptionId");

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_ipdAdmissionId_fkey" FOREIGN KEY ("ipdAdmissionId") REFERENCES "IpdAdmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEncounter" ADD CONSTRAINT "ClinicalEncounter_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSoapNote" ADD CONSTRAINT "ClinicalSoapNote_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSoapNote" ADD CONSTRAINT "ClinicalSoapNote_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSoapNote" ADD CONSTRAINT "ClinicalSoapNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDiagnosis" ADD CONSTRAINT "ClinicalDiagnosis_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDiagnosis" ADD CONSTRAINT "ClinicalDiagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDiagnosis" ADD CONSTRAINT "ClinicalDiagnosis_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescribedByUserId_fkey" FOREIGN KEY ("prescribedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
