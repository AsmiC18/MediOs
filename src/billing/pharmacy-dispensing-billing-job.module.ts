import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { JobModule } from '../jobs/job.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PharmacyDispensingBillingEnqueueService } from './pharmacy-dispensing-billing-enqueue.service';
import { PharmacyDispensingBillingJobHandler } from './pharmacy-dispensing-billing.job-handler';
import { PharmacyDispensingBillingService } from './pharmacy-dispensing-billing.service';

@Module({
  imports: [CommonModule, AuditModule, NotificationsModule, JobModule],
  providers: [
    PharmacyDispensingBillingService,
    PharmacyDispensingBillingEnqueueService,
    PharmacyDispensingBillingJobHandler,
  ],
  exports: [
    PharmacyDispensingBillingService,
    PharmacyDispensingBillingEnqueueService,
    PharmacyDispensingBillingJobHandler,
  ],
})
export class PharmacyDispensingBillingJobModule {}
