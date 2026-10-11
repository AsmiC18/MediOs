-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'DISPATCHED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT,
    "outboxId" TEXT,
    "category" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "templateKey" TEXT,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_outboxId_key" ON "Notification"("outboxId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_hospitalId_idempotencyKey_key" ON "Notification"("hospitalId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Notification_hospitalId_idx" ON "Notification"("hospitalId");

-- CreateIndex
CREATE INDEX "Notification_hospitalId_status_createdAt_idx" ON "Notification"("hospitalId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_outboxId_idx" ON "Notification"("outboxId");

-- CreateIndex
CREATE INDEX "Notification_patientId_createdAt_idx" ON "Notification"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "DomainEventOutbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
