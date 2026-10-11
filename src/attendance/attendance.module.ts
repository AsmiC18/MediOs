import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceExportService } from './attendance-export.service';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [CommonModule, AuditModule, NotificationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceExportService],
  exports: [AttendanceService, AttendanceExportService],
})
export class AttendanceModule {}
