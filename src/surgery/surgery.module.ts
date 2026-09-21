import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SurgeryRequestController } from './surgery-request.controller';
import { SurgeryScheduleController } from './surgery-schedule.controller';
import { SurgeryService } from './surgery.service';

@Module({
  imports: [CommonModule, AuditModule, SchedulingModule],
  controllers: [SurgeryRequestController, SurgeryScheduleController],
  providers: [SurgeryService],
  exports: [SurgeryService],
})
export class SurgeryModule {}
