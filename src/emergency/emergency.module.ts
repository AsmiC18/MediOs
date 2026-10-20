import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DepartmentBillingJobModule } from '../billing/department/department-billing-job.module';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmergencyVisitController } from './emergency-visit.controller';
import { EmergencyService } from './emergency.service';
import { EmergencyStaffNotificationService } from './emergency-staff-notification.service';

@Module({
  imports: [CommonModule, AuditModule, NotificationsModule, DepartmentBillingJobModule],
  controllers: [EmergencyVisitController],
  providers: [EmergencyService, EmergencyStaffNotificationService],
  exports: [EmergencyService],
})
export class EmergencyModule {}
