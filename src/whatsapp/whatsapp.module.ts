import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService, MetaWhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
