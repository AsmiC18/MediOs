import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { DepartmentBillingEnqueueService } from './department-billing-enqueue.service';
import { DepartmentBillingJobHandler } from './department-billing.job-handler';
import { DepartmentBillingProcessService } from './department-billing-process.service';
import { DraftLineInvoiceBillingService } from './draft-line-invoice-billing.service';

@Module({
  imports: [CommonModule, AuditModule, NotificationsModule],
  providers: [
    DraftLineInvoiceBillingService,
    DepartmentBillingProcessService,
    DepartmentBillingEnqueueService,
    DepartmentBillingJobHandler,
  ],
  exports: [
    DepartmentBillingEnqueueService,
    DepartmentBillingJobHandler,
    DepartmentBillingProcessService,
  ],
})
export class DepartmentBillingJobModule {}
