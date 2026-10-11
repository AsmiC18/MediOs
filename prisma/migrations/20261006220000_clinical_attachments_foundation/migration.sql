-- CreateEnum
CREATE TYPE "ClinicalAttachmentCategory" AS ENUM ('LAB', 'IMAGING', 'CONSENT', 'OTHER');

-- CreateTable
CREATE TABLE "ClinicalAttachment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "category" "ClinicalAttachmentCategory",
    "description" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalAttachment_hospitalId_storageKey_key" ON "ClinicalAttachment"("hospitalId", "storageKey");

-- CreateIndex
CREATE INDEX "ClinicalAttachment_hospitalId_idx" ON "ClinicalAttachment"("hospitalId");

-- CreateIndex
CREATE INDEX "ClinicalAttachment_branchId_idx" ON "ClinicalAttachment"("branchId");

-- CreateIndex
CREATE INDEX "ClinicalAttachment_patientId_idx" ON "ClinicalAttachment"("patientId");

-- CreateIndex
CREATE INDEX "ClinicalAttachment_encounterId_idx" ON "ClinicalAttachment"("encounterId");

-- CreateIndex
CREATE INDEX "ClinicalAttachment_deletedAt_idx" ON "ClinicalAttachment"("deletedAt");

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
