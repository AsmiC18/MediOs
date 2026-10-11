-- CreateTable
CREATE TABLE "Icd10Code" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Icd10Code_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "Icd10Code_description_idx" ON "Icd10Code"("description");

-- CreateIndex
CREATE INDEX "Icd10Code_isActive_idx" ON "Icd10Code"("isActive");
