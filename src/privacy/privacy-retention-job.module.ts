import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { PrivacyRetentionService } from './privacy-retention.service';

@Module({
  imports: [CommonModule, AuditModule],
  providers: [PrivacyRetentionService],
  exports: [PrivacyRetentionService],
})
export class PrivacyRetentionJobModule {}
