-- AlterTable
ALTER TABLE "PharmacyDispensingItem" ADD COLUMN "prescribedProductId" TEXT;
ALTER TABLE "PharmacyDispensingItem" ADD COLUMN "substitutionReason" TEXT;
ALTER TABLE "PharmacyDispensingItem" ADD COLUMN "substitutedByUserId" TEXT;
ALTER TABLE "PharmacyDispensingItem" ADD COLUMN "substitutedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PharmacyDispensingItem_prescribedProductId_idx" ON "PharmacyDispensingItem"("prescribedProductId");

-- AddForeignKey
ALTER TABLE "PharmacyDispensingItem" ADD CONSTRAINT "PharmacyDispensingItem_prescribedProductId_fkey" FOREIGN KEY ("prescribedProductId") REFERENCES "PharmacyProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyDispensingItem" ADD CONSTRAINT "PharmacyDispensingItem_substitutedByUserId_fkey" FOREIGN KEY ("substitutedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
