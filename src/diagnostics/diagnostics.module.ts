import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DepartmentBillingEnqueueService } from '../billing/department/department-billing-enqueue.service';
import { CommonModule } from '../common/common.module';
import { JobModule } from '../jobs/job.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DiagnosticOrderController } from './diagnostic-order.controller';
import { DiagnosticOrderItemController } from './diagnostic-order-item.controller';
import { DiagnosticsService } from './diagnostics.service';
import { PatientDiagnosticsController } from './patient-diagnostics.controller';

@Module({
  imports: [CommonModule, AuditModule, NotificationsModule, JobModule],
  controllers: [
    DiagnosticOrderController,
    DiagnosticOrderItemController,
    PatientDiagnosticsController,
  ],
  providers: [DiagnosticsService, DepartmentBillingEnqueueService],
  exports: [DiagnosticsService],
})
export class DiagnosticsModule {}
