-- CreateEnum
CREATE TYPE "DrugResolutionStatus" AS ENUM ('RESOLVED', 'UNRESOLVED', 'FREE_TEXT');

-- CreateEnum
CREATE TYPE "PrescriptionSafetyFindingType" AS ENUM ('ALLERGY', 'INTERACTION', 'DUPLICATE_THERAPY', 'UNRESOLVED_DRUG');

-- CreateEnum
CREATE TYPE "PrescriptionSafetySeverity" AS ENUM ('INFO', 'WARNING', 'BLOCK');

-- CreateEnum
CREATE TYPE "PrescriptionSafetyFindingSource" AS ENUM ('RULES', 'ADAPTER', 'FALLBACK_TEXT');

-- CreateEnum
CREATE TYPE "InteractionAdapterStatus" AS ENUM ('OK', 'UNAVAILABLE', 'ERROR');

-- CreateEnum
CREATE TYPE "ClinicalSafetyPolicyAction" AS ENUM ('WARN', 'BLOCK');

-- CreateEnum
CREATE TYPE "InteractionWhenUnavailable" AS ENUM ('ALLOW_WITH_WARNING', 'BLOCK');

-- AlterTable
ALTER TABLE "PrescriptionItem" ADD COLUMN     "clinicalDrugId" TEXT,
ADD COLUMN     "drugResolutionStatus" "DrugResolutionStatus" NOT NULL DEFAULT 'FREE_TEXT';

-- CreateTable
CREATE TABLE "ClinicalDrug" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "brandName" TEXT,
    "strength" TEXT,
    "dosageForm" TEXT,
    "route" TEXT,
    "externalConceptId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalDrug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDrugIngredient" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "clinicalDrugId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "externalConceptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalDrugIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalFormularyEntry" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "clinicalDrugId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultPharmacyProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalFormularyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalClinicalSafetyPolicy" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "allergyUnresolvedDrugDefault" "ClinicalSafetyPolicyAction" NOT NULL DEFAULT 'WARN',
    "allergyIngredientMatch" "ClinicalSafetyPolicyAction" NOT NULL DEFAULT 'WARN',
    "allergyTextFallback" "ClinicalSafetyPolicyAction" NOT NULL DEFAULT 'WARN',
    "interactionWhenUnavailable" "InteractionWhenUnavailable" NOT NULL DEFAULT 'ALLOW_WITH_WARNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalClinicalSafetyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionSafetyEvaluation" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluatorVersion" TEXT NOT NULL,
    "interactionAdapterStatus" "InteractionAdapterStatus" NOT NULL,
    "patientUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionSafetyEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionSafetyFinding" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "findingKey" TEXT NOT NULL,
    "findingType" "PrescriptionSafetyFindingType" NOT NULL,
    "severity" "PrescriptionSafetySeverity" NOT NULL,
    "summary" TEXT NOT NULL,
    "detailJson" JSONB,
    "source" "PrescriptionSafetyFindingSource" NOT NULL,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overrideByUserId" TEXT,
    "overrideAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionSafetyFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrescriptionItem_clinicalDrugId_idx" ON "PrescriptionItem"("clinicalDrugId");

-- CreateIndex
CREATE INDEX "ClinicalDrug_hospitalId_idx" ON "ClinicalDrug"("hospitalId");

-- CreateIndex
CREATE INDEX "ClinicalDrug_hospitalId_isActive_idx" ON "ClinicalDrug"("hospitalId", "isActive");

-- CreateIndex
CREATE INDEX "ClinicalDrug_genericName_idx" ON "ClinicalDrug"("genericName");

-- CreateIndex
CREATE INDEX "ClinicalDrugIngredient_hospitalId_idx" ON "ClinicalDrugIngredient"("hospitalId");

-- CreateIndex
CREATE INDEX "ClinicalDrugIngredient_clinicalDrugId_idx" ON "ClinicalDrugIngredient"("clinicalDrugId");

-- CreateIndex
CREATE INDEX "HospitalFormularyEntry_hospitalId_idx" ON "HospitalFormularyEntry"("hospitalId");

-- CreateIndex
CREATE INDEX "HospitalFormularyEntry_clinicalDrugId_idx" ON "HospitalFormularyEntry"("clinicalDrugId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalFormularyEntry_hospitalId_clinicalDrugId_key" ON "HospitalFormularyEntry"("hospitalId", "clinicalDrugId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalClinicalSafetyPolicy_hospitalId_key" ON "HospitalClinicalSafetyPolicy"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionSafetyEvaluation_prescriptionId_key" ON "PrescriptionSafetyEvaluation"("prescriptionId");

-- CreateIndex
CREATE INDEX "PrescriptionSafetyEvaluation_hospitalId_idx" ON "PrescriptionSafetyEvaluation"("hospitalId");

-- CreateIndex
CREATE INDEX "PrescriptionSafetyFinding_hospitalId_idx" ON "PrescriptionSafetyFinding"("hospitalId");

-- CreateIndex
CREATE INDEX "PrescriptionSafetyFinding_evaluationId_idx" ON "PrescriptionSafetyFinding"("evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionSafetyFinding_evaluationId_findingKey_key" ON "PrescriptionSafetyFinding"("evaluationId", "findingKey");

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_clinicalDrugId_fkey" FOREIGN KEY ("clinicalDrugId") REFERENCES "ClinicalDrug"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDrug" ADD CONSTRAINT "ClinicalDrug_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDrugIngredient" ADD CONSTRAINT "ClinicalDrugIngredient_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDrugIngredient" ADD CONSTRAINT "ClinicalDrugIngredient_clinicalDrugId_fkey" FOREIGN KEY ("clinicalDrugId") REFERENCES "ClinicalDrug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalFormularyEntry" ADD CONSTRAINT "HospitalFormularyEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalFormularyEntry" ADD CONSTRAINT "HospitalFormularyEntry_clinicalDrugId_fkey" FOREIGN KEY ("clinicalDrugId") REFERENCES "ClinicalDrug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalFormularyEntry" ADD CONSTRAINT "HospitalFormularyEntry_defaultPharmacyProductId_fkey" FOREIGN KEY ("defaultPharmacyProductId") REFERENCES "PharmacyProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalClinicalSafetyPolicy" ADD CONSTRAINT "HospitalClinicalSafetyPolicy_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSafetyEvaluation" ADD CONSTRAINT "PrescriptionSafetyEvaluation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSafetyEvaluation" ADD CONSTRAINT "PrescriptionSafetyEvaluation_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSafetyFinding" ADD CONSTRAINT "PrescriptionSafetyFinding_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionSafetyFinding" ADD CONSTRAINT "PrescriptionSafetyFinding_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "PrescriptionSafetyEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
