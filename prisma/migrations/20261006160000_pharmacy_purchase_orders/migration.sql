-- CreateEnum
CREATE TYPE "PharmacyPurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PharmacySupplier" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacySupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPurchaseOrder" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "supplierId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" "PharmacyPurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "fullyReceivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyPurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPurchaseOrderReceipt" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "purchaseOrderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "receivedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyPurchaseOrderReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPurchaseOrderReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyPurchaseOrderReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PharmacySupplier_hospitalId_idx" ON "PharmacySupplier"("hospitalId");
CREATE INDEX "PharmacySupplier_isActive_idx" ON "PharmacySupplier"("isActive");
CREATE INDEX "PharmacySupplier_name_idx" ON "PharmacySupplier"("name");
CREATE UNIQUE INDEX "PharmacySupplier_hospitalId_code_key" ON "PharmacySupplier"("hospitalId", "code");

CREATE INDEX "PharmacyPurchaseOrder_hospitalId_idx" ON "PharmacyPurchaseOrder"("hospitalId");
CREATE INDEX "PharmacyPurchaseOrder_branchId_idx" ON "PharmacyPurchaseOrder"("branchId");
CREATE INDEX "PharmacyPurchaseOrder_supplierId_idx" ON "PharmacyPurchaseOrder"("supplierId");
CREATE INDEX "PharmacyPurchaseOrder_status_idx" ON "PharmacyPurchaseOrder"("status");
CREATE INDEX "PharmacyPurchaseOrder_createdAt_idx" ON "PharmacyPurchaseOrder"("createdAt");
CREATE UNIQUE INDEX "PharmacyPurchaseOrder_hospitalId_poNumber_key" ON "PharmacyPurchaseOrder"("hospitalId", "poNumber");

CREATE INDEX "PharmacyPurchaseOrderItem_purchaseOrderId_idx" ON "PharmacyPurchaseOrderItem"("purchaseOrderId");
CREATE INDEX "PharmacyPurchaseOrderItem_productId_idx" ON "PharmacyPurchaseOrderItem"("productId");
CREATE UNIQUE INDEX "PharmacyPurchaseOrderItem_purchaseOrderId_productId_key" ON "PharmacyPurchaseOrderItem"("purchaseOrderId", "productId");

CREATE INDEX "PharmacyPurchaseOrderReceipt_hospitalId_idx" ON "PharmacyPurchaseOrderReceipt"("hospitalId");
CREATE INDEX "PharmacyPurchaseOrderReceipt_purchaseOrderId_idx" ON "PharmacyPurchaseOrderReceipt"("purchaseOrderId");
CREATE INDEX "PharmacyPurchaseOrderReceipt_createdAt_idx" ON "PharmacyPurchaseOrderReceipt"("createdAt");
CREATE UNIQUE INDEX "PharmacyPurchaseOrderReceipt_hospitalId_idempotencyKey_key" ON "PharmacyPurchaseOrderReceipt"("hospitalId", "idempotencyKey");

CREATE INDEX "PharmacyPurchaseOrderReceiptLine_receiptId_idx" ON "PharmacyPurchaseOrderReceiptLine"("receiptId");
CREATE INDEX "PharmacyPurchaseOrderReceiptLine_purchaseOrderItemId_idx" ON "PharmacyPurchaseOrderReceiptLine"("purchaseOrderItemId");
CREATE INDEX "PharmacyPurchaseOrderReceiptLine_batchId_idx" ON "PharmacyPurchaseOrderReceiptLine"("batchId");

-- AddForeignKey
ALTER TABLE "PharmacySupplier" ADD CONSTRAINT "PharmacySupplier_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PharmacyPurchaseOrder" ADD CONSTRAINT "PharmacyPurchaseOrder_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrder" ADD CONSTRAINT "PharmacyPurchaseOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrder" ADD CONSTRAINT "PharmacyPurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "PharmacySupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrder" ADD CONSTRAINT "PharmacyPurchaseOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrder" ADD CONSTRAINT "PharmacyPurchaseOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PharmacyPurchaseOrderItem" ADD CONSTRAINT "PharmacyPurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PharmacyPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrderItem" ADD CONSTRAINT "PharmacyPurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyPurchaseOrderReceipt" ADD CONSTRAINT "PharmacyPurchaseOrderReceipt_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrderReceipt" ADD CONSTRAINT "PharmacyPurchaseOrderReceipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrderReceipt" ADD CONSTRAINT "PharmacyPurchaseOrderReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PharmacyPurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrderReceipt" ADD CONSTRAINT "PharmacyPurchaseOrderReceipt_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyPurchaseOrderReceiptLine" ADD CONSTRAINT "PharmacyPurchaseOrderReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PharmacyPurchaseOrderReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrderReceiptLine" ADD CONSTRAINT "PharmacyPurchaseOrderReceiptLine_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PharmacyPurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrderReceiptLine" ADD CONSTRAINT "PharmacyPurchaseOrderReceiptLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
