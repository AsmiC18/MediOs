-- CreateEnum
CREATE TYPE "PaymentPayerType" AS ENUM ('PATIENT', 'INSURER');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'MANUAL';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "payerType" "PaymentPayerType" NOT NULL DEFAULT 'PATIENT',
ADD COLUMN     "insuranceClaimId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE INDEX "Payment_payerType_idx" ON "Payment"("payerType");

-- CreateIndex
CREATE INDEX "Payment_insuranceClaimId_idx" ON "Payment"("insuranceClaimId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_hospitalId_idempotencyKey_key" ON "Payment"("hospitalId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_insuranceClaimId_fkey" FOREIGN KEY ("insuranceClaimId") REFERENCES "InsuranceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
