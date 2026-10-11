-- AlterTable
ALTER TABLE "BookingRule" ADD COLUMN     "minimumAdvanceMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maximumAdvanceMinutes" INTEGER,
ADD COLUMN     "cancellationWindowMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bufferMinutes" INTEGER NOT NULL DEFAULT 0;
