-- CreateTable
CREATE TABLE "WhatsAppConfig" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_hospitalId_key" ON "WhatsAppConfig"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfig_phoneNumberId_key" ON "WhatsAppConfig"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppConfig_hospitalId_idx" ON "WhatsAppConfig"("hospitalId");

-- CreateIndex
CREATE INDEX "WhatsAppConfig_phoneNumberId_idx" ON "WhatsAppConfig"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppConfig_enabled_idx" ON "WhatsAppConfig"("enabled");

-- AddForeignKey
ALTER TABLE "WhatsAppConfig" ADD CONSTRAINT "WhatsAppConfig_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
