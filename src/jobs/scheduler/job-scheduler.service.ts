import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobService } from '../job.service';
import { truncateJobError } from '../job-error.util';
import {
  JobSchedulerConfig,
  loadJobSchedulerConfig,
} from './job-scheduler.config';
import { resolveJobSchedulerLeaderLockKey } from './scheduler-lock.util';
import { SchedulerTaskRegistry } from './scheduler-task.registry';
import { AppointmentReminderSchedulerTask } from './appointment-reminder-scheduler.task';
import { AbdmConsentExpireSchedulerTask } from './abdm-consent-expire-scheduler.task';
import { BillingPaymentReconcileSchedulerTask } from './billing-payment-reconcile-scheduler.task';
import { BillingRefundReconcileSchedulerTask } from './billing-refund-reconcile-scheduler.task';
import { PatientAtRiskSchedulerTask } from './patient-at-risk-scheduler.task';
import { AttendanceMonthlySummarySchedulerTask } from './attendance-monthly-summary-scheduler.task';
import { PrivacyRetentionSchedulerTask } from './privacy-retention-scheduler.task';
import { SchedulerTestNoopTask } from './scheduler-test-noop.task';
import { PharmacyExpirySchedulerTask } from '../../pharmacy/jobs/pharmacy-expiry-scheduler.task';
import { PharmacyLowStockSchedulerTask } from '../../pharmacy/jobs/pharmacy-low-stock-scheduler.task';
import {
  SchedulerExecutionContext,
  SchedulerTask,
  SchedulerTickResult,
  schedulerTaskRequiresTestHospitalId,
} from './scheduler.types';
import { schedulerSavepoint } from './scheduler-savepoint.util';
import { formatUtcMinuteWindow } from './scheduler-window.util';

const SCHEDULER_INTERVAL_NAME = 'medios-job-scheduler-tick';

@Injectable()
export class JobSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobSchedulerService.name);
  private readonly config: JobSchedulerConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: JobService,
    private readonly taskRegistry: SchedulerTaskRegistry,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly schedulerTestNoopTask: SchedulerTestNoopTask,
    private readonly abdmConsentExpireSchedulerTask: AbdmConsentExpireSchedulerTask,
    private readonly billingPaymentReconcileSchedulerTask: BillingPaymentReconcileSchedulerTask,
    private readonly billingRefundReconcileSchedulerTask: BillingRefundReconcileSchedulerTask,
    private readonly appointmentReminderSchedulerTask: AppointmentReminderSchedulerTask,
    private readonly privacyRetentionSchedulerTask: PrivacyRetentionSchedulerTask,
    private readonly patientAtRiskSchedulerTask: PatientAtRiskSchedulerTask,
    private readonly attendanceMonthlySummarySchedulerTask: AttendanceMonthlySummarySchedulerTask,
    private readonly pharmacyLowStockSchedulerTask: PharmacyLowStockSchedulerTask,
    private readonly pharmacyExpirySchedulerTask: PharmacyExpirySchedulerTask,
  ) {
    this.config = loadJobSchedulerConfig();
  }

  onModuleInit(): void {
    if (this.config.consentExpireEnabled) {
      this.taskRegistry.register(this.abdmConsentExpireSchedulerTask);
    }

    if (this.config.billingPaymentReconcileEnabled) {
      this.taskRegistry.register(this.billingPaymentReconcileSchedulerTask);
    }

    if (this.config.billingRefundReconcileEnabled) {
      this.taskRegistry.register(this.billingRefundReconcileSchedulerTask);
    }

    if (this.config.appointmentReminderSchedulerEnabled) {
      this.taskRegistry.register(this.appointmentReminderSchedulerTask);
    }

    if (this.config.privacyRetentionSchedulerEnabled) {
      this.taskRegistry.register(this.privacyRetentionSchedulerTask);
    }

    if (this.config.patientAtRiskSchedulerEnabled) {
      this.taskRegistry.register(this.patientAtRiskSchedulerTask);
    }

    if (this.config.attendanceMonthlySummarySchedulerEnabled) {
      this.taskRegistry.register(this.attendanceMonthlySummarySchedulerTask);
    }

    if (this.config.pharmacyLowStockSchedulerEnabled) {
      this.taskRegistry.register(this.pharmacyLowStockSchedulerTask);
    }

    if (this.config.pharmacyExpirySchedulerEnabled) {
      this.taskRegistry.register(this.pharmacyExpirySchedulerTask);
    }

    if (this.config.testNoopEnabled) {
      if (!this.config.testHospitalId) {
        this.logger.warn(
          JSON.stringify({
            event: 'scheduler_test_noop_skipped',
            reason: 'JOB_SCHEDULER_TEST_HOSPITAL_ID is not set',
          }),
        );
      } else {
        this.taskRegistry.register(this.schedulerTestNoopTask);
      }
    }

    if (!this.config.enabled) {
      this.logger.log(
        JSON.stringify({
          event: 'scheduler_disabled',
          scheduler: SCHEDULER_INTERVAL_NAME,
        }),
      );
      return;
    }

    const interval = setInterval(() => {
      void this.runTick().catch((error) => {
        this.logger.error(
          JSON.stringify({
            event: 'scheduler_tick_unhandled',
            scheduler: SCHEDULER_INTERVAL_NAME,
            message: truncateJobError(error),
          }),
        );
      });
    }, this.config.intervalMs);

    this.schedulerRegistry.addInterval(SCHEDULER_INTERVAL_NAME, interval);
    this.logger.log(
      JSON.stringify({
        event: 'scheduler_started',
        scheduler: SCHEDULER_INTERVAL_NAME,
        intervalMs: this.config.intervalMs,
        taskCount: this.taskRegistry.list().length,
      }),
    );
  }

  onModuleDestroy(): void {
    try {
      this.schedulerRegistry.deleteInterval(SCHEDULER_INTERVAL_NAME);
    } catch {
      // Interval was never registered when scheduler is disabled.
    }
  }

  async runTick(tickAt: Date = new Date()): Promise<SchedulerTickResult> {
    const started = Date.now();
    const windowKey = formatUtcMinuteWindow(tickAt);

    if (!this.config.enabled) {
      return {
        windowKey,
        leaderAcquired: false,
        tasksRun: 0,
        taskOutcomes: [],
        durationMs: Date.now() - started,
      };
    }

    const taskOutcomes: SchedulerTickResult['taskOutcomes'] = [];
    let leaderAcquired = false;
    let tasksRun = 0;

    try {
      await this.prisma.$transaction(async (transaction) => {
        const lockRows = await transaction.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtext(${resolveJobSchedulerLeaderLockKey()})) AS locked
        `;
        leaderAcquired = lockRows[0]?.locked === true;

        if (!leaderAcquired) {
          this.logger.log(
            JSON.stringify({
              event: 'scheduler_tick',
              scheduler: SCHEDULER_INTERVAL_NAME,
              windowKey,
              leaderAcquired: false,
              outcome: 'skipped',
            }),
          );
          return;
        }

        const tasks = this.taskRegistry.list();
        const testHospitalId = this.config.testHospitalId;

        for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
          const task = tasks[taskIndex];
          if (schedulerTaskRequiresTestHospitalId(task) && !testHospitalId) {
            this.logger.warn(
              JSON.stringify({
                event: 'scheduler_task_skipped',
                scheduler: SCHEDULER_INTERVAL_NAME,
                windowKey,
                task: task.name,
                reason: 'missing_test_hospital_scope',
              }),
            );
            continue;
          }

          const context: SchedulerExecutionContext = {
            windowKey,
            tickAt,
            ...(testHospitalId ? { hospitalId: testHospitalId } : {}),
            transaction,
            jobService: this.jobService,
          };

          const savepointName = `scheduler_task_${taskIndex}`;
          await schedulerSavepoint(transaction, 'SAVEPOINT', savepointName);
          try {
            await this.runTask(task, context);
            await schedulerSavepoint(
              transaction,
              'RELEASE SAVEPOINT',
              savepointName,
            );
            tasksRun += 1;
            taskOutcomes.push({ name: task.name, outcome: 'success' });
          } catch (error) {
            await schedulerSavepoint(
              transaction,
              'ROLLBACK TO SAVEPOINT',
              savepointName,
            );
            taskOutcomes.push({ name: task.name, outcome: 'failed' });
            this.logger.warn(
              JSON.stringify({
                event: 'scheduler_task_failed',
                scheduler: SCHEDULER_INTERVAL_NAME,
                windowKey,
                task: task.name,
                message: truncateJobError(error),
              }),
            );
          }
        }

        this.logger.log(
          JSON.stringify({
            event: 'scheduler_tick',
            scheduler: SCHEDULER_INTERVAL_NAME,
            windowKey,
            leaderAcquired: true,
            tasksRun,
            durationMs: Date.now() - started,
            outcome: 'completed',
          }),
        );
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'scheduler_tick_failed',
          scheduler: SCHEDULER_INTERVAL_NAME,
          windowKey,
          message: truncateJobError(error),
        }),
      );
    }

    return {
      windowKey,
      leaderAcquired,
      tasksRun,
      taskOutcomes,
      durationMs: Date.now() - started,
    };
  }

  getConfig(): JobSchedulerConfig {
    return this.config;
  }

  private async runTask(
    task: SchedulerTask,
    context: SchedulerExecutionContext,
  ): Promise<void> {
    await task.run(context);
  }
}
