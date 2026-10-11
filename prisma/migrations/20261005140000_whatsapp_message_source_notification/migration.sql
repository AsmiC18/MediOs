-- AlterTable
ALTER TABLE "WhatsAppMessage" ADD COLUMN "sourceNotificationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_sourceNotificationId_key" ON "WhatsAppMessage"("sourceNotificationId");

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_sourceNotificationId_fkey" FOREIGN KEY ("sourceNotificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
