import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { OpdQueueController } from './opd-queue.controller';
import { OpdQueueService } from './opd-queue.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [OpdQueueController],
  providers: [OpdQueueService],
  exports: [OpdQueueService],
})
export class OpdModule {}
