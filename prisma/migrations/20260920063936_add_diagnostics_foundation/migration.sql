-- CreateEnum
CREATE TYPE "DiagnosticOrderStatus" AS ENUM ('ORDERED', 'SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiagnosticOrderPriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "DiagnosticOrderItemStatus" AS ENUM ('PENDING', 'RESULTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "DiagnosticResultFlag" AS ENUM ('NORMAL', 'LOW', 'HIGH', 'ABNORMAL');

-- CreateTable
CREATE TABLE "DiagnosticOrder" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "DiagnosticOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "priority" "DiagnosticOrderPriority" NOT NULL DEFAULT 'NORMAL',
    "orderedByUserId" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampleCollectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticOrderItem" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "testCode" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "specimenType" TEXT NOT NULL,
    "status" "DiagnosticOrderItemStatus" NOT NULL DEFAULT 'PENDING',
    "resultValue" TEXT,
    "resultUnit" TEXT,
    "referenceRange" TEXT,
    "resultFlag" "DiagnosticResultFlag",
    "resultNotes" TEXT,
    "resultedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "resultedByUserId" TEXT,
    "verifiedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiagnosticOrder_hospitalId_idx" ON "DiagnosticOrder"("hospitalId");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_branchId_idx" ON "DiagnosticOrder"("branchId");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_patientId_idx" ON "DiagnosticOrder"("patientId");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_encounterId_idx" ON "DiagnosticOrder"("encounterId");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_status_idx" ON "DiagnosticOrder"("status");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_priority_idx" ON "DiagnosticOrder"("priority");

-- CreateIndex
CREATE INDEX "DiagnosticOrder_orderedAt_idx" ON "DiagnosticOrder"("orderedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticOrder_hospitalId_orderNumber_key" ON "DiagnosticOrder"("hospitalId", "orderNumber");

-- CreateIndex
CREATE INDEX "DiagnosticOrderItem_hospitalId_idx" ON "DiagnosticOrderItem"("hospitalId");

-- CreateIndex
CREATE INDEX "DiagnosticOrderItem_orderId_idx" ON "DiagnosticOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "DiagnosticOrderItem_status_idx" ON "DiagnosticOrderItem"("status");

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrder" ADD CONSTRAINT "DiagnosticOrder_orderedByUserId_fkey" FOREIGN KEY ("orderedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrderItem" ADD CONSTRAINT "DiagnosticOrderItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrderItem" ADD CONSTRAINT "DiagnosticOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DiagnosticOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrderItem" ADD CONSTRAINT "DiagnosticOrderItem_resultedByUserId_fkey" FOREIGN KEY ("resultedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticOrderItem" ADD CONSTRAINT "DiagnosticOrderItem_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
