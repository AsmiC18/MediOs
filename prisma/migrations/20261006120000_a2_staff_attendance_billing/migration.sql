-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "consultationFeeUnitPrice" DECIMAL(12,2),
ADD COLUMN     "consultationFeeHsnSac" TEXT,
ADD COLUMN     "consultationFeeGstRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "sourceKey" TEXT;

-- CreateTable
CREATE TABLE "AttendanceMonthlySummary" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "totalAttendanceDays" INTEGER NOT NULL DEFAULT 0,
    "presentDays" INTEGER NOT NULL DEFAULT 0,
    "lateDays" INTEGER NOT NULL DEFAULT 0,
    "halfDayDays" INTEGER NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "totalLateMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalEarlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceMonthlySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceMonthlySummary_hospitalId_idx" ON "AttendanceMonthlySummary"("hospitalId");

-- CreateIndex
CREATE INDEX "AttendanceMonthlySummary_branchId_idx" ON "AttendanceMonthlySummary"("branchId");

-- CreateIndex
CREATE INDEX "AttendanceMonthlySummary_userId_idx" ON "AttendanceMonthlySummary"("userId");

-- CreateIndex
CREATE INDEX "AttendanceMonthlySummary_periodYear_periodMonth_idx" ON "AttendanceMonthlySummary"("periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceMonthlySummary_hospitalId_branchId_userId_periodYear_periodMonth_key" ON "AttendanceMonthlySummary"("hospitalId", "branchId", "userId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "Resource_userId_idx" ON "Resource"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_hospitalId_userId_key" ON "Resource"("hospitalId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceItem_hospitalId_sourceKey_key" ON "InvoiceItem"("hospitalId", "sourceKey");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthlySummary" ADD CONSTRAINT "AttendanceMonthlySummary_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthlySummary" ADD CONSTRAINT "AttendanceMonthlySummary_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthlySummary" ADD CONSTRAINT "AttendanceMonthlySummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
