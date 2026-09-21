-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "workScheduleId" TEXT;

-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "defaultWorkScheduleId" TEXT;

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "workStartTime" TEXT NOT NULL,
    "workEndTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkSchedule_hospitalId_idx" ON "WorkSchedule"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_workScheduleId_key" ON "Branch"("workScheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_defaultWorkScheduleId_key" ON "Hospital"("defaultWorkScheduleId");

-- AddForeignKey
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_defaultWorkScheduleId_fkey" FOREIGN KEY ("defaultWorkScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
