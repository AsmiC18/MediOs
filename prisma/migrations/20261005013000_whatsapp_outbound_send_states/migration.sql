-- AlterEnum
ALTER TYPE "WhatsAppMessageStatus" ADD VALUE 'SENDING';
ALTER TYPE "WhatsAppMessageStatus" ADD VALUE 'SUBMIT_UNCERTAIN';

-- AlterTable
ALTER TABLE "WhatsAppMessage" ADD COLUMN "templateParameters" JSONB;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "sendLockedAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppMessage" ADD COLUMN "sendLockedBy" TEXT;
