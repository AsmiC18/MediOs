-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Leave_hospitalId_idx" ON "Leave"("hospitalId");

-- CreateIndex
CREATE INDEX "Leave_branchId_idx" ON "Leave"("branchId");

-- CreateIndex
CREATE INDEX "Leave_userId_idx" ON "Leave"("userId");

-- CreateIndex
CREATE INDEX "Leave_status_idx" ON "Leave"("status");

-- CreateIndex
CREATE INDEX "Leave_startAt_idx" ON "Leave"("startAt");

-- CreateIndex
CREATE INDEX "Leave_endAt_idx" ON "Leave"("endAt");

-- CreateIndex
CREATE INDEX "Leave_hospitalId_userId_startAt_idx" ON "Leave"("hospitalId", "userId", "startAt");

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
