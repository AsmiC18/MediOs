-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'DEAD');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "type" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_status_availableAt_idx" ON "Job"("status", "availableAt");

-- CreateIndex
CREATE INDEX "Job_hospitalId_status_availableAt_idx" ON "Job"("hospitalId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "Job_hospitalId_branchId_status_availableAt_idx" ON "Job"("hospitalId", "branchId", "status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_hospitalId_type_idempotencyKey_key" ON "Job"("hospitalId", "type", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
