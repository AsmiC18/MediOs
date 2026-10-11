import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DepartmentBillingJobModule } from './department/department-billing-job.module';
import { StaffAttendanceConsultationJobHandler } from './staff-attendance-consultation.job-handler';
import { StaffAttendanceConsultationService } from './staff-attendance-consultation.service';

@Module({
  imports: [CommonModule, AuditModule, NotificationsModule, DepartmentBillingJobModule],
  providers: [
    StaffAttendanceConsultationService,
    StaffAttendanceConsultationJobHandler,
  ],
  exports: [
    StaffAttendanceConsultationService,
    StaffAttendanceConsultationJobHandler,
  ],
})
export class StaffAttendanceConsultationJobModule {}
