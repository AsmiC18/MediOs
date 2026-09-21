-- CreateEnum
CREATE TYPE "PharmacyStockMovementType" AS ENUM ('PURCHASE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DISPENSE', 'RETURN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PharmacyDispensingStatus" AS ENUM ('PENDING', 'DISPENSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "PrescriptionItem" ADD COLUMN     "quantity" INTEGER;

-- CreateTable
CREATE TABLE "PharmacyProduct" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "strength" TEXT,
    "dosageForm" TEXT,
    "unit" TEXT NOT NULL,
    "sku" TEXT,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyBatch" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "unitCost" DECIMAL(12,2),
    "sellingPrice" DECIMAL(12,2),
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyStockMovement" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "movementType" "PharmacyStockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "PharmacyStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyDispensing" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "PharmacyDispensingStatus" NOT NULL DEFAULT 'PENDING',
    "dispensedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyDispensing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyDispensingItem" (
    "id" TEXT NOT NULL,
    "dispensingId" TEXT NOT NULL,
    "prescriptionItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyDispensingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PharmacyProduct_hospitalId_idx" ON "PharmacyProduct"("hospitalId");

-- CreateIndex
CREATE INDEX "PharmacyProduct_branchId_idx" ON "PharmacyProduct"("branchId");

-- CreateIndex
CREATE INDEX "PharmacyProduct_isActive_idx" ON "PharmacyProduct"("isActive");

-- CreateIndex
CREATE INDEX "PharmacyProduct_name_idx" ON "PharmacyProduct"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyProduct_hospitalId_sku_key" ON "PharmacyProduct"("hospitalId", "sku");

-- CreateIndex
CREATE INDEX "PharmacyBatch_hospitalId_idx" ON "PharmacyBatch"("hospitalId");

-- CreateIndex
CREATE INDEX "PharmacyBatch_branchId_idx" ON "PharmacyBatch"("branchId");

-- CreateIndex
CREATE INDEX "PharmacyBatch_productId_idx" ON "PharmacyBatch"("productId");

-- CreateIndex
CREATE INDEX "PharmacyBatch_expiryDate_idx" ON "PharmacyBatch"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyBatch_hospitalId_productId_batchNumber_key" ON "PharmacyBatch"("hospitalId", "productId", "batchNumber");

-- CreateIndex
CREATE INDEX "PharmacyStockMovement_hospitalId_idx" ON "PharmacyStockMovement"("hospitalId");

-- CreateIndex
CREATE INDEX "PharmacyStockMovement_branchId_idx" ON "PharmacyStockMovement"("branchId");

-- CreateIndex
CREATE INDEX "PharmacyStockMovement_productId_idx" ON "PharmacyStockMovement"("productId");

-- CreateIndex
CREATE INDEX "PharmacyStockMovement_batchId_idx" ON "PharmacyStockMovement"("batchId");

-- CreateIndex
CREATE INDEX "PharmacyStockMovement_movementType_idx" ON "PharmacyStockMovement"("movementType");

-- CreateIndex
CREATE INDEX "PharmacyStockMovement_createdAt_idx" ON "PharmacyStockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "PharmacyDispensing_hospitalId_idx" ON "PharmacyDispensing"("hospitalId");

-- CreateIndex
CREATE INDEX "PharmacyDispensing_branchId_idx" ON "PharmacyDispensing"("branchId");

-- CreateIndex
CREATE INDEX "PharmacyDispensing_patientId_idx" ON "PharmacyDispensing"("patientId");

-- CreateIndex
CREATE INDEX "PharmacyDispensing_prescriptionId_idx" ON "PharmacyDispensing"("prescriptionId");

-- CreateIndex
CREATE INDEX "PharmacyDispensing_status_idx" ON "PharmacyDispensing"("status");

-- CreateIndex
CREATE INDEX "PharmacyDispensing_dispensedAt_idx" ON "PharmacyDispensing"("dispensedAt");

-- CreateIndex
CREATE INDEX "PharmacyDispensingItem_dispensingId_idx" ON "PharmacyDispensingItem"("dispensingId");

-- CreateIndex
CREATE INDEX "PharmacyDispensingItem_prescriptionItemId_idx" ON "PharmacyDispensingItem"("prescriptionItemId");

-- CreateIndex
CREATE INDEX "PharmacyDispensingItem_productId_idx" ON "PharmacyDispensingItem"("productId");

-- CreateIndex
CREATE INDEX "PharmacyDispensingItem_batchId_idx" ON "PharmacyDispensingItem"("batchId");

-- AddForeignKey
ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "PharmacyProduct_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "PharmacyProduct_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensing" ADD CONSTRAINT "PharmacyDispensing_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensing" ADD CONSTRAINT "PharmacyDispensing_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensing" ADD CONSTRAINT "PharmacyDispensing_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensing" ADD CONSTRAINT "PharmacyDispensing_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensing" ADD CONSTRAINT "PharmacyDispensing_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensingItem" ADD CONSTRAINT "PharmacyDispensingItem_dispensingId_fkey" FOREIGN KEY ("dispensingId") REFERENCES "PharmacyDispensing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensingItem" ADD CONSTRAINT "PharmacyDispensingItem_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensingItem" ADD CONSTRAINT "PharmacyDispensingItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispensingItem" ADD CONSTRAINT "PharmacyDispensingItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
