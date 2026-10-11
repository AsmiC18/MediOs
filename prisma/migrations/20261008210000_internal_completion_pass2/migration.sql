-- CreateEnum
CREATE TYPE "HospitalDepartmentKey" AS ENUM ('OPD', 'IPD', 'EMERGENCY', 'PHARMACY', 'DIAGNOSTICS', 'SURGERY');
CREATE TYPE "BillingCatalogueItemType" AS ENUM ('SERVICE', 'MEDICINE_REFERENCE');
CREATE TYPE "PaymentCheckoutIntentStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'UNCERTAIN');
CREATE TYPE "ReportProjectionType" AS ENUM ('DAILY_DASHBOARD', 'OPD_METRICS', 'IPD_OCCUPANCY', 'DEPARTMENT_REVENUE', 'DOCTOR_PERFORMANCE', 'PATIENT_COHORT', 'GST_SUMMARY', 'ATTENDANCE_SUMMARY', 'PHARMACY_SHRINK', 'INSURANCE_AGEING', 'ABDM_ADOPTION');
CREATE TYPE "InsurancePreauthAttachmentType" AS ENUM ('CLINICAL_NOTE', 'ID_PROOF', 'INSURER_FORM', 'OTHER');
CREATE TYPE "IpdDailyChartEntryType" AS ENUM ('VITAL', 'NOTE');

-- CreateTable
CREATE TABLE "StaffInAppNotification" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffInAppNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HospitalDepartmentToggle" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "departmentKey" "HospitalDepartmentKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,
    CONSTRAINT "HospitalDepartmentToggle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingCatalogueItem" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "itemType" "BillingCatalogueItemType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "hsnSac" TEXT,
    "pharmacyProductId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingCatalogueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentCheckoutIntent" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentCheckoutIntentStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    CONSTRAINT "PaymentCheckoutIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportProjection" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "reportType" "ReportProjectionType" NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportProjection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InsurancePreauthAttachment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "preauthId" TEXT NOT NULL,
    "attachmentType" "InsurancePreauthAttachmentType" NOT NULL DEFAULT 'OTHER',
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsurancePreauthAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IpdDailyChartEntry" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "admissionId" TEXT NOT NULL,
    "entryType" "IpdDailyChartEntryType" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vitalsJson" JSONB,
    "noteText" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IpdDailyChartEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurgeryPreOpChecklistItem" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "surgeryRequestId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SurgeryPreOpChecklistItem_pkey" PRIMARY KEY ("id")
);

-- Indexes & FKs (abbreviated; Prisma will align)
CREATE UNIQUE INDEX "StaffInAppNotification_hospitalId_userId_idx" ON "StaffInAppNotification"("hospitalId", "userId");
CREATE INDEX "StaffInAppNotification_hospitalId_userId_readAt_createdAt_idx" ON "StaffInAppNotification"("hospitalId", "userId", "readAt", "createdAt");

CREATE UNIQUE INDEX "HospitalDepartmentToggle_hospitalId_departmentKey_key" ON "HospitalDepartmentToggle"("hospitalId", "departmentKey");
CREATE INDEX "HospitalDepartmentToggle_hospitalId_idx" ON "HospitalDepartmentToggle"("hospitalId");

CREATE UNIQUE INDEX "BillingCatalogueItem_hospitalId_code_key" ON "BillingCatalogueItem"("hospitalId", "code");
CREATE INDEX "BillingCatalogueItem_hospitalId_isActive_idx" ON "BillingCatalogueItem"("hospitalId", "isActive");

CREATE UNIQUE INDEX "PaymentCheckoutIntent_hospitalId_idempotencyKey_key" ON "PaymentCheckoutIntent"("hospitalId", "idempotencyKey");

CREATE UNIQUE INDEX "ReportProjection_hospitalId_branchId_reportType_periodFrom_periodTo_scopeKey_key" ON "ReportProjection"("hospitalId", "branchId", "reportType", "periodFrom", "periodTo", "scopeKey");

CREATE INDEX "InsurancePreauthAttachment_hospitalId_preauthId_idx" ON "InsurancePreauthAttachment"("hospitalId", "preauthId");

CREATE INDEX "IpdDailyChartEntry_hospitalId_admissionId_recordedAt_idx" ON "IpdDailyChartEntry"("hospitalId", "admissionId", "recordedAt");

CREATE UNIQUE INDEX "SurgeryPreOpChecklistItem_surgeryRequestId_itemKey_key" ON "SurgeryPreOpChecklistItem"("surgeryRequestId", "itemKey");

ALTER TABLE "StaffInAppNotification" ADD CONSTRAINT "StaffInAppNotification_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffInAppNotification" ADD CONSTRAINT "StaffInAppNotification_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffInAppNotification" ADD CONSTRAINT "StaffInAppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HospitalDepartmentToggle" ADD CONSTRAINT "HospitalDepartmentToggle_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingCatalogueItem" ADD CONSTRAINT "BillingCatalogueItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingCatalogueItem" ADD CONSTRAINT "BillingCatalogueItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingCatalogueItem" ADD CONSTRAINT "BillingCatalogueItem_pharmacyProductId_fkey" FOREIGN KEY ("pharmacyProductId") REFERENCES "PharmacyProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentCheckoutIntent" ADD CONSTRAINT "PaymentCheckoutIntent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentCheckoutIntent" ADD CONSTRAINT "PaymentCheckoutIntent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentCheckoutIntent" ADD CONSTRAINT "PaymentCheckoutIntent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportProjection" ADD CONSTRAINT "ReportProjection_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportProjection" ADD CONSTRAINT "ReportProjection_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InsurancePreauthAttachment" ADD CONSTRAINT "InsurancePreauthAttachment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsurancePreauthAttachment" ADD CONSTRAINT "InsurancePreauthAttachment_preauthId_fkey" FOREIGN KEY ("preauthId") REFERENCES "InsurancePreAuthorization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsurancePreauthAttachment" ADD CONSTRAINT "InsurancePreauthAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IpdDailyChartEntry" ADD CONSTRAINT "IpdDailyChartEntry_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "IpdAdmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurgeryPreOpChecklistItem" ADD CONSTRAINT "SurgeryPreOpChecklistItem_surgeryRequestId_fkey" FOREIGN KEY ("surgeryRequestId") REFERENCES "SurgeryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
