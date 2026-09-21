-- CreateEnum
CREATE TYPE "OpdQueueStatus" AS ENUM ('WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpdQueuePriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateTable
CREATE TABLE "OpdQueueEntry" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "queueDate" DATE NOT NULL,
    "tokenNumber" INTEGER NOT NULL,
    "status" "OpdQueueStatus" NOT NULL DEFAULT 'WAITING',
    "priority" "OpdQueuePriority" NOT NULL DEFAULT 'NORMAL',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "consultationStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpdQueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpdQueueEntry_hospitalId_idx" ON "OpdQueueEntry"("hospitalId");

-- CreateIndex
CREATE INDEX "OpdQueueEntry_branchId_idx" ON "OpdQueueEntry"("branchId");

-- CreateIndex
CREATE INDEX "OpdQueueEntry_appointmentId_idx" ON "OpdQueueEntry"("appointmentId");

-- CreateIndex
CREATE INDEX "OpdQueueEntry_patientId_idx" ON "OpdQueueEntry"("patientId");

-- CreateIndex
CREATE INDEX "OpdQueueEntry_queueDate_idx" ON "OpdQueueEntry"("queueDate");

-- CreateIndex
CREATE INDEX "OpdQueueEntry_status_idx" ON "OpdQueueEntry"("status");

-- CreateIndex
CREATE INDEX "OpdQueueEntry_priority_idx" ON "OpdQueueEntry"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "OpdQueueEntry_hospitalId_queueDate_tokenNumber_key" ON "OpdQueueEntry"("hospitalId", "queueDate", "tokenNumber");

-- AddForeignKey
ALTER TABLE "OpdQueueEntry" ADD CONSTRAINT "OpdQueueEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdQueueEntry" ADD CONSTRAINT "OpdQueueEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdQueueEntry" ADD CONSTRAINT "OpdQueueEntry_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdQueueEntry" ADD CONSTRAINT "OpdQueueEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
