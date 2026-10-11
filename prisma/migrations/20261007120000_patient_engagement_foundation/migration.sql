-- CreateEnum
CREATE TYPE "PatientEngagementActionType" AS ENUM ('FOLLOW_UP', 'REBOOK', 'WIN_BACK');

-- CreateEnum
CREATE TYPE "PatientEngagementActionStatus" AS ENUM ('OPEN', 'ACTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PatientNpsCategory" AS ENUM ('DETRACTOR', 'PASSIVE', 'PROMOTER');

-- CreateEnum
CREATE TYPE "PatientWinbackCampaignStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "PatientEngagementAction" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "type" "PatientEngagementActionType" NOT NULL,
    "status" "PatientEngagementActionStatus" NOT NULL DEFAULT 'OPEN',
    "suggestedAction" TEXT,
    "reason" TEXT,
    "actedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "actedByUserId" TEXT,
    "dismissedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientEngagementAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientNpsResponse" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "category" "PatientNpsCategory" NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientNpsResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientWinbackCampaign" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "status" "PatientWinbackCampaignStatus" NOT NULL DEFAULT 'PENDING',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientWinbackCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientEngagementAction_hospitalId_idx" ON "PatientEngagementAction"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientEngagementAction_branchId_idx" ON "PatientEngagementAction"("branchId");

-- CreateIndex
CREATE INDEX "PatientEngagementAction_patientId_idx" ON "PatientEngagementAction"("patientId");

-- CreateIndex
CREATE INDEX "PatientEngagementAction_status_idx" ON "PatientEngagementAction"("status");

-- CreateIndex
CREATE INDEX "PatientEngagementAction_type_idx" ON "PatientEngagementAction"("type");

-- CreateIndex
CREATE INDEX "PatientEngagementAction_hospitalId_status_type_idx" ON "PatientEngagementAction"("hospitalId", "status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PatientNpsResponse_appointmentId_key" ON "PatientNpsResponse"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientNpsResponse_hospitalId_appointmentId_key" ON "PatientNpsResponse"("hospitalId", "appointmentId");

-- CreateIndex
CREATE INDEX "PatientNpsResponse_hospitalId_idx" ON "PatientNpsResponse"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientNpsResponse_branchId_idx" ON "PatientNpsResponse"("branchId");

-- CreateIndex
CREATE INDEX "PatientNpsResponse_patientId_idx" ON "PatientNpsResponse"("patientId");

-- CreateIndex
CREATE INDEX "PatientNpsResponse_category_idx" ON "PatientNpsResponse"("category");

-- CreateIndex
CREATE INDEX "PatientNpsResponse_respondedAt_idx" ON "PatientNpsResponse"("respondedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientWinbackCampaign_hospitalId_idempotencyKey_key" ON "PatientWinbackCampaign"("hospitalId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PatientWinbackCampaign_hospitalId_idx" ON "PatientWinbackCampaign"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientWinbackCampaign_branchId_idx" ON "PatientWinbackCampaign"("branchId");

-- CreateIndex
CREATE INDEX "PatientWinbackCampaign_status_idx" ON "PatientWinbackCampaign"("status");

-- AddForeignKey
ALTER TABLE "PatientEngagementAction" ADD CONSTRAINT "PatientEngagementAction_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientEngagementAction" ADD CONSTRAINT "PatientEngagementAction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientEngagementAction" ADD CONSTRAINT "PatientEngagementAction_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientEngagementAction" ADD CONSTRAINT "PatientEngagementAction_actedByUserId_fkey" FOREIGN KEY ("actedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientEngagementAction" ADD CONSTRAINT "PatientEngagementAction_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNpsResponse" ADD CONSTRAINT "PatientNpsResponse_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNpsResponse" ADD CONSTRAINT "PatientNpsResponse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNpsResponse" ADD CONSTRAINT "PatientNpsResponse_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNpsResponse" ADD CONSTRAINT "PatientNpsResponse_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientWinbackCampaign" ADD CONSTRAINT "PatientWinbackCampaign_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientWinbackCampaign" ADD CONSTRAINT "PatientWinbackCampaign_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientWinbackCampaign" ADD CONSTRAINT "PatientWinbackCampaign_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
