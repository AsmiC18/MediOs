-- CreateEnum
CREATE TYPE "AbhaVerificationMethod" AS ENUM ('DEMOGRAPHICS', 'MOBILE_OTP', 'QR_SCAN', 'PROFILE_LOGIN');

-- AlterTable
ALTER TABLE "AbdmHospitalConfig" ADD COLUMN     "bridgeId" TEXT,
ADD COLUMN     "callbackBaseUrl" TEXT;

-- AlterTable
ALTER TABLE "PatientAbhaLink" ADD COLUMN     "abdmRequestId" TEXT,
ADD COLUMN     "abdmTransactionId" TEXT,
ADD COLUMN     "linkToken" TEXT,
ADD COLUMN     "linkTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "verificationMethod" "AbhaVerificationMethod";

-- CreateIndex
CREATE INDEX "PatientAbhaLink_abdmRequestId_idx" ON "PatientAbhaLink"("abdmRequestId");
