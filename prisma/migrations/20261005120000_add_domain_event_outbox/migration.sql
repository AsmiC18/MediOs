-- CreateEnum
CREATE TYPE "DomainEventOutboxStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "DomainEventOutbox" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DomainEventOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "DomainEventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainEventOutbox_status_createdAt_idx" ON "DomainEventOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DomainEventOutbox_hospitalId_idx" ON "DomainEventOutbox"("hospitalId");

-- CreateIndex
CREATE INDEX "DomainEventOutbox_hospitalId_eventType_idx" ON "DomainEventOutbox"("hospitalId", "eventType");

-- CreateIndex
CREATE INDEX "DomainEventOutbox_entityType_entityId_idx" ON "DomainEventOutbox"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEventOutbox_hospitalId_idempotencyKey_key" ON "DomainEventOutbox"("hospitalId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
