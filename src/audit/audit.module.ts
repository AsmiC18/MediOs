import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { AuditLogController } from './audit-log.controller';
import { AuditLogExportService } from './audit-log-export.service';
import { AuditLogQueryService } from './audit-log.service';
import { AuditService } from './audit.service';

@Module({
  imports: [CommonModule, AuthModule],
  controllers: [AuditLogController],
  providers: [AuditService, AuditLogQueryService, AuditLogExportService],
  exports: [AuditService],
})
export class AuditModule {}
