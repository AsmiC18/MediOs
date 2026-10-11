import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from '../../notifications/notifications.module';
import { JobModule } from '../job.module';
import {
  AppointmentReminder24hSchedulerTask,
  AppointmentReminderSchedulerTask,
} from './appointment-reminder-scheduler.task';
import { JobSchedulerService } from './job-scheduler.service';
import { SchedulerTaskRegistry } from './scheduler-task.registry';
import { AbdmConsentExpireSchedulerTask } from './abdm-consent-expire-scheduler.task';
import { BillingPaymentReconcileSchedulerTask } from './billing-payment-reconcile-scheduler.task';
import { BillingRefundReconcileSchedulerTask } from './billing-refund-reconcile-scheduler.task';
import { PatientAtRiskSchedulerTask } from './patient-at-risk-scheduler.task';
import { AttendanceMonthlySummarySchedulerTask } from './attendance-monthly-summary-scheduler.task';
import { PrivacyRetentionSchedulerTask } from './privacy-retention-scheduler.task';
import { SchedulerTestNoopTask } from './scheduler-test-noop.task';
import { PharmacyExpirySchedulerTask } from '../../pharmacy/jobs/pharmacy-expiry-scheduler.task';
import { PharmacyLowStockSchedulerTask } from '../../pharmacy/jobs/pharmacy-low-stock-scheduler.task';

@Module({
  imports: [ScheduleModule.forRoot(), JobModule, NotificationsModule],
  providers: [
    SchedulerTaskRegistry,
    AppointmentReminderSchedulerTask,
    AppointmentReminder24hSchedulerTask,
    AbdmConsentExpireSchedulerTask,
    BillingPaymentReconcileSchedulerTask,
    BillingRefundReconcileSchedulerTask,
    SchedulerTestNoopTask,
    PrivacyRetentionSchedulerTask,
    PatientAtRiskSchedulerTask,
    AttendanceMonthlySummarySchedulerTask,
    PharmacyLowStockSchedulerTask,
    PharmacyExpirySchedulerTask,
    JobSchedulerService,
  ],
  exports: [JobSchedulerService, SchedulerTaskRegistry],
})
export class JobSchedulerModule {}
