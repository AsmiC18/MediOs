import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AttendanceMonthlySummaryHandler } from './attendance-monthly-summary.handler';
import { AttendanceMonthlySummaryService } from './attendance-monthly-summary.service';

@Module({
  imports: [CommonModule],
  providers: [AttendanceMonthlySummaryService, AttendanceMonthlySummaryHandler],
  exports: [AttendanceMonthlySummaryService, AttendanceMonthlySummaryHandler],
})
export class AttendanceJobModule {}
