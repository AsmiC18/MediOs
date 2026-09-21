import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { WorkSchedulesController } from './work-schedules.controller';
import { WorkSchedulesService } from './work-schedules.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [WorkSchedulesController],
  providers: [WorkSchedulesService],
  exports: [WorkSchedulesService],
})
export class WorkSchedulesModule {}
