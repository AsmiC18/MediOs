-- CreateEnum
CREATE TYPE "SurgeryPriority" AS ENUM ('URGENT', 'ELECTIVE');

-- CreateEnum
CREATE TYPE "SurgeryRequestStatus" AS ENUM ('REQUESTED', 'PRE_OP', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SurgeryPreOpFitnessStatus" AS ENUM ('PENDING', 'FIT', 'NOT_FIT', 'DEFERRED');

-- CreateEnum
CREATE TYPE "SurgeryScheduleStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ResourceType" ADD VALUE 'OPERATION_THEATRE';

-- CreateTable
CREATE TABLE "SurgeryRequest" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "admissionId" TEXT,
    "preAuthorizationId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "procedureName" TEXT NOT NULL,
    "procedureCode" TEXT,
    "indication" TEXT,
    "priority" "SurgeryPriority" NOT NULL DEFAULT 'ELECTIVE',
    "status" "SurgeryRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurgeryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryPreOpAssessment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "surgeryRequestId" TEXT NOT NULL,
    "assessedByUserId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "fitnessStatus" "SurgeryPreOpFitnessStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurgeryPreOpAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgerySchedule" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "surgeryRequestId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "scheduledByUserId" TEXT NOT NULL,
    "status" "SurgeryScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurgerySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryProcedureRecord" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "surgeryRequestId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "surgeonUserId" TEXT NOT NULL,
    "assistantUserId" TEXT,
    "procedureNotes" TEXT,
    "findings" TEXT,
    "complications" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurgeryProcedureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryPostOpRecord" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "surgeryRequestId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "followUpInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurgeryPostOpRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurgeryRequest_hospitalId_idx" ON "SurgeryRequest"("hospitalId");

-- CreateIndex
CREATE INDEX "SurgeryRequest_branchId_idx" ON "SurgeryRequest"("branchId");

-- CreateIndex
CREATE INDEX "SurgeryRequest_patientId_idx" ON "SurgeryRequest"("patientId");

-- CreateIndex
CREATE INDEX "SurgeryRequest_encounterId_idx" ON "SurgeryRequest"("encounterId");

-- CreateIndex
CREATE INDEX "SurgeryRequest_admissionId_idx" ON "SurgeryRequest"("admissionId");

-- CreateIndex
CREATE INDEX "SurgeryRequest_preAuthorizationId_idx" ON "SurgeryRequest"("preAuthorizationId");

-- CreateIndex
CREATE INDEX "SurgeryRequest_status_idx" ON "SurgeryRequest"("status");

-- CreateIndex
CREATE INDEX "SurgeryRequest_priority_idx" ON "SurgeryRequest"("priority");

-- CreateIndex
CREATE INDEX "SurgeryRequest_requestedAt_idx" ON "SurgeryRequest"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SurgeryPreOpAssessment_surgeryRequestId_key" ON "SurgeryPreOpAssessment"("surgeryRequestId");

-- CreateIndex
CREATE INDEX "SurgeryPreOpAssessment_hospitalId_idx" ON "SurgeryPreOpAssessment"("hospitalId");

-- CreateIndex
CREATE INDEX "SurgeryPreOpAssessment_fitnessStatus_idx" ON "SurgeryPreOpAssessment"("fitnessStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SurgerySchedule_surgeryRequestId_key" ON "SurgerySchedule"("surgeryRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "SurgerySchedule_appointmentId_key" ON "SurgerySchedule"("appointmentId");

-- CreateIndex
CREATE INDEX "SurgerySchedule_hospitalId_idx" ON "SurgerySchedule"("hospitalId");

-- CreateIndex
CREATE INDEX "SurgerySchedule_branchId_idx" ON "SurgerySchedule"("branchId");

-- CreateIndex
CREATE INDEX "SurgerySchedule_resourceId_idx" ON "SurgerySchedule"("resourceId");

-- CreateIndex
CREATE INDEX "SurgerySchedule_status_idx" ON "SurgerySchedule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SurgeryProcedureRecord_surgeryRequestId_key" ON "SurgeryProcedureRecord"("surgeryRequestId");

-- CreateIndex
CREATE INDEX "SurgeryProcedureRecord_hospitalId_idx" ON "SurgeryProcedureRecord"("hospitalId");

-- CreateIndex
CREATE INDEX "SurgeryProcedureRecord_surgeonUserId_idx" ON "SurgeryProcedureRecord"("surgeonUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SurgeryPostOpRecord_surgeryRequestId_key" ON "SurgeryPostOpRecord"("surgeryRequestId");

-- CreateIndex
CREATE INDEX "SurgeryPostOpRecord_hospitalId_idx" ON "SurgeryPostOpRecord"("hospitalId");

-- AddForeignKey
ALTER TABLE "SurgeryRequest" ADD CONSTRAINT "SurgeryRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryRequest" ADD CONSTRAINT "SurgeryRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryRequest" ADD CONSTRAINT "SurgeryRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryRequest" ADD CONSTRAINT "SurgeryRequest_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryRequest" ADD CONSTRAINT "SurgeryRequest_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "IpdAdmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryRequest" ADD CONSTRAINT "SurgeryRequest_preAuthorizationId_fkey" FOREIGN KEY ("preAuthorizationId") REFERENCES "InsurancePreAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryRequest" ADD CONSTRAINT "SurgeryRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryPreOpAssessment" ADD CONSTRAINT "SurgeryPreOpAssessment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryPreOpAssessment" ADD CONSTRAINT "SurgeryPreOpAssessment_surgeryRequestId_fkey" FOREIGN KEY ("surgeryRequestId") REFERENCES "SurgeryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryPreOpAssessment" ADD CONSTRAINT "SurgeryPreOpAssessment_assessedByUserId_fkey" FOREIGN KEY ("assessedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgerySchedule" ADD CONSTRAINT "SurgerySchedule_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgerySchedule" ADD CONSTRAINT "SurgerySchedule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgerySchedule" ADD CONSTRAINT "SurgerySchedule_surgeryRequestId_fkey" FOREIGN KEY ("surgeryRequestId") REFERENCES "SurgeryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgerySchedule" ADD CONSTRAINT "SurgerySchedule_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgerySchedule" ADD CONSTRAINT "SurgerySchedule_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgerySchedule" ADD CONSTRAINT "SurgerySchedule_scheduledByUserId_fkey" FOREIGN KEY ("scheduledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryProcedureRecord" ADD CONSTRAINT "SurgeryProcedureRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryProcedureRecord" ADD CONSTRAINT "SurgeryProcedureRecord_surgeryRequestId_fkey" FOREIGN KEY ("surgeryRequestId") REFERENCES "SurgeryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryProcedureRecord" ADD CONSTRAINT "SurgeryProcedureRecord_surgeonUserId_fkey" FOREIGN KEY ("surgeonUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryProcedureRecord" ADD CONSTRAINT "SurgeryProcedureRecord_assistantUserId_fkey" FOREIGN KEY ("assistantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryPostOpRecord" ADD CONSTRAINT "SurgeryPostOpRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryPostOpRecord" ADD CONSTRAINT "SurgeryPostOpRecord_surgeryRequestId_fkey" FOREIGN KEY ("surgeryRequestId") REFERENCES "SurgeryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurgeryPostOpRecord" ADD CONSTRAINT "SurgeryPostOpRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
