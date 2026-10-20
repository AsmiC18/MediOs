import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobService } from '../job.service';
import {
  serializeJobErrorForLog,
  truncateJobError,
} from '../job-error.util';
import {
  JobSchedulerConfig,
  loadJobSchedulerConfig,
} from './job-scheduler.config';
import {
  shutdownSchedulerLeaderLockPool,
  withDedicatedSchedulerLeaderLock,
} from './scheduler-leader-lock-pg.util';
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
  SchedulerTickOutcome,
  SchedulerTickResult,
  schedulerTaskRequiresTestHospitalId,
  schedulerTaskUsesPerHospitalTransactions,
} from './scheduler.types';
import { runSchedulerTaskForEachHospital } from './scheduler-per-hospital-transaction.util';
import { schedulerSavepoint } from './scheduler-savepoint.util';
import { formatUtcMinuteWindow } from './scheduler-window.util';
const SCHEDULER_INTERVAL_NAME = 'medios-job-scheduler-tick';

/**
 * Scheduler leader orchestration holds a PostgreSQL session advisory lock on a
 * dedicated connection (not an open interactive transaction). Each task runs in
 * its own Prisma interactive transaction (default 5s), so successful tasks commit
 * even if a later task fails. Job idempotency keys prevent duplicate enqueue.
 */
@Injectable()
export class JobSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobSchedulerService.name);
  private readonly config: JobSchedulerConfig;

  private tickInFlight = false;

  /** Resolves when the current tick (including post-timeout work) has fully finished. */
  private activeTickDrain: Promise<void> | null = null;

  private shuttingDown = false;

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
      if (this.shuttingDown) {
        return;
      }
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

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    try {
      this.schedulerRegistry.deleteInterval(SCHEDULER_INTERVAL_NAME);
    } catch {
      // Interval was never registered when scheduler is disabled.
    }
    if (this.activeTickDrain) {
      await this.activeTickDrain;
    }
    await shutdownSchedulerLeaderLockPool();
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
        outcome: 'skipped',
      };
    }

    if (this.shuttingDown) {
      return {
        windowKey,
        leaderAcquired: false,
        tasksRun: 0,
        taskOutcomes: [],
        durationMs: Date.now() - started,
        outcome: 'skipped',
      };
    }

    if (this.tickInFlight) {
      this.logger.log(
        JSON.stringify({
          event: 'scheduler_tick_skipped',
          scheduler: SCHEDULER_INTERVAL_NAME,
          windowKey,
          reason: 'tick_in_flight',
        }),
      );
      return {
        windowKey,
        leaderAcquired: false,
        tasksRun: 0,
        taskOutcomes: [],
        durationMs: Date.now() - started,
        outcome: 'skipped',
      };
    }

    this.tickInFlight = true;

    let resolveTickDrain: (() => void) | undefined;
    this.activeTickDrain = new Promise<void>((resolve) => {
      resolveTickDrain = resolve;
    });

    const taskOutcomes: SchedulerTickResult['taskOutcomes'] = [];
    let leaderAcquired = false;
    let tasksRun = 0;
    let tickFailed = false;
    let pendingWorkCompletion: Promise<void> | undefined;

    const lockKey = resolveJobSchedulerLeaderLockKey();

    try {
      const lockRun = await withDedicatedSchedulerLeaderLock(
        lockKey,
        async () => {
          const tasks = this.taskRegistry.list();
          const testHospitalId = this.config.testHospitalId;

          const taskResults = await Promise.all(
            tasks.map(async (task, taskIndex) => {
              if (
                schedulerTaskRequiresTestHospitalId(task) &&
                !testHospitalId
              ) {
                this.logger.warn(
                  JSON.stringify({
                    event: 'scheduler_task_skipped',
                    scheduler: SCHEDULER_INTERVAL_NAME,
                    windowKey,
                    task: task.name,
                    reason: 'missing_test_hospital_scope',
                  }),
                );
                return null;
              }

              const context: Omit<SchedulerExecutionContext, 'transaction'> =
                {
                  windowKey,
                  tickAt,
                  ...(testHospitalId ? { hospitalId: testHospitalId } : {}),
                  jobService: this.jobService,
                };

              const taskStarted = Date.now();
              try {
                await this.runSchedulerTaskInTransaction(
                  task,
                  context,
                  taskIndex,
                );
                this.logger.log(
                  JSON.stringify({
                    event: 'scheduler_task_completed',
                    scheduler: SCHEDULER_INTERVAL_NAME,
                    windowKey,
                    task: task.name,
                    durationMs: Date.now() - taskStarted,
                  }),
                );
                return {
                  name: task.name,
                  outcome: 'success' as const,
                };
              } catch (error) {
                this.logger.warn(
                  JSON.stringify({
                    event: 'scheduler_task_failed',
                    scheduler: SCHEDULER_INTERVAL_NAME,
                    windowKey,
                    task: task.name,
                    durationMs: Date.now() - taskStarted,
                    message: truncateJobError(error),
                  }),
                );
                return {
                  name: task.name,
                  outcome: 'failed' as const,
                };
              }
            }),
          );

          for (const result of taskResults) {
            if (!result) {
              continue;
            }
            taskOutcomes.push(result);
            if (result.outcome === 'success') {
              tasksRun += 1;
            }
          }
        },
        { orchestrationTimeoutMs: this.config.tickTransactionTimeoutMs },
      );

      if (!lockRun.acquired) {
        leaderAcquired = false;
        this.logger.log(
          JSON.stringify({
            event: 'scheduler_tick',
            scheduler: SCHEDULER_INTERVAL_NAME,
            windowKey,
            leaderAcquired: false,
            outcome: 'skipped',
          }),
        );
      } else if ('orchestrationTimedOut' in lockRun && lockRun.orchestrationTimedOut) {
        leaderAcquired = true;
        tickFailed = true;
        pendingWorkCompletion = lockRun.workCompletion;
        this.logger.error(
          JSON.stringify({
            event: 'scheduler_tick_failed',
            scheduler: SCHEDULER_INTERVAL_NAME,
            windowKey,
            message: 'scheduler leader orchestration timed out',
            orchestrationTimeoutMs: this.config.tickTransactionTimeoutMs,
            note: 'tick_work_continues_until_settled',
          }),
        );
      } else {
        leaderAcquired = true;
      }
    } catch (error) {
      tickFailed = true;
      const errorDetails = serializeJobErrorForLog(error);
      this.logger.error(
        JSON.stringify({
          event: 'scheduler_tick_failed',
          scheduler: SCHEDULER_INTERVAL_NAME,
          windowKey,
          message: errorDetails.message,
          error: errorDetails,
        }),
      );
    }

    const outcome = this.resolveTickOutcome(
      leaderAcquired,
      taskOutcomes,
      tickFailed,
    );

    if (leaderAcquired) {
      this.logger.log(
        JSON.stringify({
          event: 'scheduler_tick',
          scheduler: SCHEDULER_INTERVAL_NAME,
          windowKey,
          leaderAcquired: true,
          tasksRun,
          durationMs: Date.now() - started,
          outcome,
        }),
      );
    }

    const tickResult: SchedulerTickResult = {
      windowKey,
      leaderAcquired,
      tasksRun,
      taskOutcomes,
      durationMs: Date.now() - started,
      outcome,
    };

    if (pendingWorkCompletion) {
      void pendingWorkCompletion.finally(() => {
        this.finishTickLifecycle(resolveTickDrain);
      });
    } else {
      this.finishTickLifecycle(resolveTickDrain);
    }

    return tickResult;
  }

  private finishTickLifecycle(resolveTickDrain?: () => void): void {
    this.tickInFlight = false;
    resolveTickDrain?.();
    this.activeTickDrain = null;
  }

  getConfig(): JobSchedulerConfig {
    return this.config;
  }

  private resolveTickOutcome(
    leaderAcquired: boolean,
    taskOutcomes: SchedulerTickResult['taskOutcomes'],
    tickFailed: boolean,
  ): SchedulerTickOutcome {
    if (!leaderAcquired) {
      return 'skipped';
    }
    if (tickFailed) {
      return taskOutcomes.some((row) => row.outcome === 'success')
        ? 'partial'
        : 'failed';
    }
    if (taskOutcomes.length === 0) {
      return 'completed';
    }
    if (taskOutcomes.every((row) => row.outcome === 'success')) {
      return 'completed';
    }
    if (taskOutcomes.some((row) => row.outcome === 'success')) {
      return 'partial';
    }
    return 'failed';
  }

  private async runSchedulerTaskInTransaction(
    task: SchedulerTask,
    context: Omit<SchedulerExecutionContext, 'transaction'>,
    taskIndex: number,
  ): Promise<void> {
    if (schedulerTaskUsesPerHospitalTransactions(task)) {
      await runSchedulerTaskForEachHospital(
        this.prisma,
        task,
        context,
        {
          scheduler: SCHEDULER_INTERVAL_NAME,
          windowKey: context.windowKey,
          taskName: task.name,
          taskIndex,
          taskTransactionTimeoutMs: this.config.taskTransactionTimeoutMs,
          taskTransactionMaxWaitMs: 10_000,
          hospitalConcurrency: this.config.hospitalConcurrency,
        },
      );
      return;
    }

    await this.prisma.$transaction(
      async (transaction) => {
        const savepointName = `scheduler_task_${taskIndex}`;
        await schedulerSavepoint(transaction, 'SAVEPOINT', savepointName);
        try {
          await this.runTask(task, { ...context, transaction });
          await schedulerSavepoint(
            transaction,
            'RELEASE SAVEPOINT',
            savepointName,
          );
        } catch (error) {
          await schedulerSavepoint(
            transaction,
            'ROLLBACK TO SAVEPOINT',
            savepointName,
          );
          throw error;
        }
      },
      {
        maxWait: 10_000,
        timeout: this.config.taskTransactionTimeoutMs,
      },
    );
  }

  private async runTask(
    task: SchedulerTask,
    context: SchedulerExecutionContext,
  ): Promise<void> {
    await task.run(context);
  }
}
