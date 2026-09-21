-- CreateEnum
CREATE TYPE "EmergencyVisitStatus" AS ENUM ('ARRIVED', 'TRIAGED', 'IN_TREATMENT', 'DISCHARGED', 'ADMITTED', 'TRANSFERRED', 'LEFT_WITHOUT_BEING_SEEN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmergencyPriority" AS ENUM ('EMERGENCY', 'URGENT', 'NORMAL');

-- CreateEnum
CREATE TYPE "EmergencyDisposition" AS ENUM ('DISCHARGED', 'ADMITTED', 'TRANSFERRED', 'LEFT_WITHOUT_BEING_SEEN');

-- CreateTable
CREATE TABLE "EmergencyVisit" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "arrivalAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EmergencyVisitStatus" NOT NULL DEFAULT 'ARRIVED',
    "priority" "EmergencyPriority" NOT NULL DEFAULT 'NORMAL',
    "chiefComplaint" TEXT,
    "notes" TEXT,
    "disposition" "EmergencyDisposition",
    "treatmentStartedAt" TIMESTAMP(3),
    "dispositionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriageRecord" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "emergencyVisitId" TEXT NOT NULL,
    "assessedByUserId" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" "EmergencyPriority" NOT NULL,
    "temperature" DOUBLE PRECISION,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "oxygenSaturation" INTEGER,
    "painScore" INTEGER,
    "consciousness" TEXT,
    "notes" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyVisit_encounterId_key" ON "EmergencyVisit"("encounterId");

-- CreateIndex
CREATE INDEX "EmergencyVisit_hospitalId_idx" ON "EmergencyVisit"("hospitalId");

-- CreateIndex
CREATE INDEX "EmergencyVisit_branchId_idx" ON "EmergencyVisit"("branchId");

-- CreateIndex
CREATE INDEX "EmergencyVisit_patientId_idx" ON "EmergencyVisit"("patientId");

-- CreateIndex
CREATE INDEX "EmergencyVisit_status_idx" ON "EmergencyVisit"("status");

-- CreateIndex
CREATE INDEX "EmergencyVisit_priority_idx" ON "EmergencyVisit"("priority");

-- CreateIndex
CREATE INDEX "EmergencyVisit_arrivalAt_idx" ON "EmergencyVisit"("arrivalAt");

-- CreateIndex
CREATE INDEX "TriageRecord_hospitalId_idx" ON "TriageRecord"("hospitalId");

-- CreateIndex
CREATE INDEX "TriageRecord_emergencyVisitId_idx" ON "TriageRecord"("emergencyVisitId");

-- CreateIndex
CREATE INDEX "TriageRecord_assessedAt_idx" ON "TriageRecord"("assessedAt");

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyVisit" ADD CONSTRAINT "EmergencyVisit_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageRecord" ADD CONSTRAINT "TriageRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageRecord" ADD CONSTRAINT "TriageRecord_emergencyVisitId_fkey" FOREIGN KEY ("emergencyVisitId") REFERENCES "EmergencyVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageRecord" ADD CONSTRAINT "TriageRecord_assessedByUserId_fkey" FOREIGN KEY ("assessedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
