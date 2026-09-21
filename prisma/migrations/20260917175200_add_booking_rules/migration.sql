-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "bookingRuleId" TEXT;

-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "defaultBookingRuleId" TEXT;

-- CreateTable
CREATE TABLE "BookingRule" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "minDurationMinutes" INTEGER NOT NULL DEFAULT 5,
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 480,
    "slotDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingRule_hospitalId_idx" ON "BookingRule"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_bookingRuleId_key" ON "Branch"("bookingRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_defaultBookingRuleId_key" ON "Hospital"("defaultBookingRuleId");

-- AddForeignKey
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_defaultBookingRuleId_fkey" FOREIGN KEY ("defaultBookingRuleId") REFERENCES "BookingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_bookingRuleId_fkey" FOREIGN KEY ("bookingRuleId") REFERENCES "BookingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRule" ADD CONSTRAINT "BookingRule_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
