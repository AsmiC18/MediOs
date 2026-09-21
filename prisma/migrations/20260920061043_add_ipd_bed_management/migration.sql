-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BedType" AS ENUM ('GENERAL', 'PRIVATE', 'ICU', 'ISOLATION');

-- CreateEnum
CREATE TYPE "IpdAdmissionStatus" AS ENUM ('ADMITTED', 'DISCHARGED', 'CANCELLED');

-- CreateTable
CREATE TABLE "IpdBed" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "wardName" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "bedNumber" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "bedType" "BedType" NOT NULL DEFAULT 'GENERAL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpdBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpdAdmission" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "admissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargeDate" TIMESTAMP(3),
    "status" "IpdAdmissionStatus" NOT NULL DEFAULT 'ADMITTED',
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpdAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpdBedAssignment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "IpdBedAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IpdBed_hospitalId_idx" ON "IpdBed"("hospitalId");

-- CreateIndex
CREATE INDEX "IpdBed_branchId_idx" ON "IpdBed"("branchId");

-- CreateIndex
CREATE INDEX "IpdBed_status_idx" ON "IpdBed"("status");

-- CreateIndex
CREATE INDEX "IpdBed_bedType_idx" ON "IpdBed"("bedType");

-- CreateIndex
CREATE INDEX "IpdBed_wardName_idx" ON "IpdBed"("wardName");

-- CreateIndex
CREATE UNIQUE INDEX "IpdBed_hospitalId_branchId_wardName_roomNumber_bedNumber_key" ON "IpdBed"("hospitalId", "branchId", "wardName", "roomNumber", "bedNumber");

-- CreateIndex
CREATE INDEX "IpdAdmission_hospitalId_idx" ON "IpdAdmission"("hospitalId");

-- CreateIndex
CREATE INDEX "IpdAdmission_branchId_idx" ON "IpdAdmission"("branchId");

-- CreateIndex
CREATE INDEX "IpdAdmission_patientId_idx" ON "IpdAdmission"("patientId");

-- CreateIndex
CREATE INDEX "IpdAdmission_status_idx" ON "IpdAdmission"("status");

-- CreateIndex
CREATE INDEX "IpdAdmission_admissionDate_idx" ON "IpdAdmission"("admissionDate");

-- CreateIndex
CREATE UNIQUE INDEX "IpdAdmission_hospitalId_admissionNumber_key" ON "IpdAdmission"("hospitalId", "admissionNumber");

-- CreateIndex
CREATE INDEX "IpdBedAssignment_hospitalId_idx" ON "IpdBedAssignment"("hospitalId");

-- CreateIndex
CREATE INDEX "IpdBedAssignment_admissionId_idx" ON "IpdBedAssignment"("admissionId");

-- CreateIndex
CREATE INDEX "IpdBedAssignment_bedId_idx" ON "IpdBedAssignment"("bedId");

-- CreateIndex
CREATE INDEX "IpdBedAssignment_assignedAt_idx" ON "IpdBedAssignment"("assignedAt");

-- AddForeignKey
ALTER TABLE "IpdBed" ADD CONSTRAINT "IpdBed_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdBed" ADD CONSTRAINT "IpdBed_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdAdmission" ADD CONSTRAINT "IpdAdmission_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdAdmission" ADD CONSTRAINT "IpdAdmission_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdAdmission" ADD CONSTRAINT "IpdAdmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdBedAssignment" ADD CONSTRAINT "IpdBedAssignment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdBedAssignment" ADD CONSTRAINT "IpdBedAssignment_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "IpdAdmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdBedAssignment" ADD CONSTRAINT "IpdBedAssignment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "IpdBed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
