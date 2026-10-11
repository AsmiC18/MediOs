-- CreateTable
CREATE TABLE "ClinicalSoapNoteVersion" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalSoapNoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalSoapNoteVersion_encounterId_createdAt_idx" ON "ClinicalSoapNoteVersion"("encounterId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalSoapNoteVersion_hospitalId_idx" ON "ClinicalSoapNoteVersion"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalSoapNoteVersion_encounterId_version_key" ON "ClinicalSoapNoteVersion"("encounterId", "version");

-- AddForeignKey
ALTER TABLE "ClinicalSoapNoteVersion" ADD CONSTRAINT "ClinicalSoapNoteVersion_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSoapNoteVersion" ADD CONSTRAINT "ClinicalSoapNoteVersion_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "ClinicalEncounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSoapNoteVersion" ADD CONSTRAINT "ClinicalSoapNoteVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill version 1 for existing current SOAP notes (historical state at creation time).
INSERT INTO "ClinicalSoapNoteVersion" (
    "id",
    "hospitalId",
    "encounterId",
    "version",
    "subjective",
    "objective",
    "assessment",
    "plan",
    "createdByUserId",
    "createdAt"
)
SELECT
    gen_random_uuid()::text,
    "hospitalId",
    "encounterId",
    1,
    "subjective",
    "objective",
    "assessment",
    "plan",
    "createdByUserId",
    "createdAt"
FROM "ClinicalSoapNote";
