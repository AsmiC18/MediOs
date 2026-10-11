-- CreateEnum
CREATE TYPE "PharmacyPrescriptionWorkItemStatus" AS ENUM ('OPEN', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "PharmacyPrescriptionWorkItem" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "prescriptionId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "PharmacyPrescriptionWorkItemStatus" NOT NULL DEFAULT 'OPEN',
    "lastOutboxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyPrescriptionWorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPrescriptionWorkItem_prescriptionId_key" ON "PharmacyPrescriptionWorkItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "PharmacyPrescriptionWorkItem_hospitalId_idx" ON "PharmacyPrescriptionWorkItem"("hospitalId");

-- CreateIndex
CREATE INDEX "PharmacyPrescriptionWorkItem_branchId_idx" ON "PharmacyPrescriptionWorkItem"("branchId");

-- CreateIndex
CREATE INDEX "PharmacyPrescriptionWorkItem_status_idx" ON "PharmacyPrescriptionWorkItem"("status");

-- AddForeignKey
ALTER TABLE "PharmacyPrescriptionWorkItem" ADD CONSTRAINT "PharmacyPrescriptionWorkItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPrescriptionWorkItem" ADD CONSTRAINT "PharmacyPrescriptionWorkItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPrescriptionWorkItem" ADD CONSTRAINT "PharmacyPrescriptionWorkItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
