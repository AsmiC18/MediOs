import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AuditService } from './audit.service';

@Module({
  imports: [CommonModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
