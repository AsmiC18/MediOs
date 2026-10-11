-- CreateTable
CREATE TABLE "PatientNotificationPreference" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "whatsappTransactionalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientNotificationPreference_hospitalId_idx" ON "PatientNotificationPreference"("hospitalId");

-- CreateIndex
CREATE INDEX "PatientNotificationPreference_patientId_idx" ON "PatientNotificationPreference"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientNotificationPreference_hospitalId_patientId_key" ON "PatientNotificationPreference"("hospitalId", "patientId");

-- AddForeignKey
ALTER TABLE "PatientNotificationPreference" ADD CONSTRAINT "PatientNotificationPreference_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNotificationPreference" ADD CONSTRAINT "PatientNotificationPreference_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
