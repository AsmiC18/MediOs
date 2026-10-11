-- AlterTable
ALTER TABLE "PharmacyPrescriptionWorkItem" ADD COLUMN     "fulfilledDispensingId" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPrescriptionWorkItem_fulfilledDispensingId_key" ON "PharmacyPrescriptionWorkItem"("fulfilledDispensingId");

-- AddForeignKey
ALTER TABLE "PharmacyPrescriptionWorkItem" ADD CONSTRAINT "PharmacyPrescriptionWorkItem_fulfilledDispensingId_fkey" FOREIGN KEY ("fulfilledDispensingId") REFERENCES "PharmacyDispensing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
