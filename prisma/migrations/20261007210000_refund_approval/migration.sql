-- AlterEnum
ALTER TYPE "RefundStatus" ADD VALUE 'APPROVED';
ALTER TYPE "RefundStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Refund" ADD COLUMN "requestedByUserId" TEXT;
ALTER TABLE "Refund" ADD COLUMN "approvedByUserId" TEXT;
ALTER TABLE "Refund" ADD COLUMN "rejectedByUserId" TEXT;
ALTER TABLE "Refund" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Refund" ADD COLUMN "rejectedAt" TIMESTAMP(3);
