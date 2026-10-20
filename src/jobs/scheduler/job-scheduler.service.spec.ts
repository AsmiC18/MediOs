jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: {
    forRoot: jest.fn(),
  },
  SchedulerRegistry: jest.fn(),
}));

jest.mock('./scheduler-leader-lock-pg.util', () => {
  const actual = jest.requireActual('./scheduler-leader-lock-pg.util');
  return {
    ...actual,
    withDedicatedSchedulerLeaderLock: jest.fn(),
    shutdownSchedulerLeaderLockPool: jest.fn().mockResolvedValue(undefined),
    isSchedulerLeaderLockAvailable: jest.fn(),
  };
});

import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { JobService } from '../job.service';
import { AppointmentReminderSchedulerTask } from './appointment-reminder-scheduler.task';
import { AbdmConsentExpireSchedulerTask } from './abdm-consent-expire-scheduler.task';
import { PatientAtRiskSchedulerTask } from './patient-at-risk-scheduler.task';
import { AttendanceMonthlySummarySchedulerTask } from './attendance-monthly-summary-scheduler.task';
import { PharmacyExpirySchedulerTask } from '../../pharmacy/jobs/pharmacy-expiry-scheduler.task';
import { PharmacyLowStockSchedulerTask } from '../../pharmacy/jobs/pharmacy-low-stock-scheduler.task';
import { PrivacyRetentionSchedulerTask } from './privacy-retention-scheduler.task';
import { BillingPaymentReconcileSchedulerTask } from './billing-payment-reconcile-scheduler.task';
import { BillingRefundReconcileSchedulerTask } from './billing-refund-reconcile-scheduler.task';
import { JobSchedulerService } from './job-scheduler.service';
import { SchedulerTaskRegistry } from './scheduler-task.registry';
import {
  SCHEDULER_TEST_NOOP_JOB_TYPE,
  SchedulerTestNoopTask,
} from './scheduler-test-noop.task';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';
import { formatUtcMinuteWindow } from './scheduler-window.util';
import * as schedulerLeaderLockPg from './scheduler-leader-lock-pg.util';
import { resolveJobSchedulerLeaderLockKey } from './scheduler-lock.util';

const withDedicatedSchedulerLeaderLock =
  schedulerLeaderLockPg.withDedicatedSchedulerLeaderLock as jest.Mock;

function mockLeaderLockGranted(runWork = true): void {
  withDedicatedSchedulerLeaderLock.mockImplementation(
    async (_lockKey: string, fn: () => Promise<void>) => {
      if (runWork) {
        await fn();
      }
      return { acquired: true };
    },
  );
}

function mockLeaderLockDenied(): void {
  withDedicatedSchedulerLeaderLock.mockResolvedValue({ acquired: false });
}

describe('formatUtcMinuteWindow', () => {
  it('uses a deterministic UTC minute bucket', () => {
    const date = new Date('2026-10-04T18:42:59.999Z');
    expect(formatUtcMinuteWindow(date)).toBe('2026-10-04T18:42Z');
  });
});

describe('JobSchedulerService (unit)', () => {
  const originalEnv = { ...process.env };

  const schedulerRegistry = {
    addInterval: jest.fn(),
    deleteInterval: jest.fn(),
  } as unknown as SchedulerRegistry;

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function schedulerInjectableTasks() {
    return {
      schedulerTestNoopTask: new SchedulerTestNoopTask(),
      abdmConsentExpireSchedulerTask: new AbdmConsentExpireSchedulerTask(),
      billingPaymentReconcileSchedulerTask: new BillingPaymentReconcileSchedulerTask(),
      billingRefundReconcileSchedulerTask: new BillingRefundReconcileSchedulerTask(),
      appointmentReminderSchedulerTask: new AppointmentReminderSchedulerTask({} as never),
      privacyRetentionSchedulerTask: new PrivacyRetentionSchedulerTask(),
      patientAtRiskSchedulerTask: new PatientAtRiskSchedulerTask(),
      attendanceMonthlySummarySchedulerTask: new AttendanceMonthlySummarySchedulerTask(),
      pharmacyLowStockSchedulerTask: new PharmacyLowStockSchedulerTask(),
      pharmacyExpirySchedulerTask: new PharmacyExpirySchedulerTask(),
    };
  }

  function buildService(taskRegistry = new SchedulerTaskRegistry()): JobSchedulerService {
    const jobService = {
      enqueueWithClient: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const tasks = schedulerInjectableTasks();
    return new JobSchedulerService(
      { $transaction: jest.fn() } as never,
      jobService as never,
      taskRegistry,
      schedulerRegistry,
      tasks.schedulerTestNoopTask,
      tasks.abdmConsentExpireSchedulerTask,
      tasks.billingPaymentReconcileSchedulerTask,
      tasks.billingRefundReconcileSchedulerTask,
      tasks.appointmentReminderSchedulerTask,
      tasks.privacyRetentionSchedulerTask,
      tasks.patientAtRiskSchedulerTask,
      tasks.attendanceMonthlySummarySchedulerTask,
      tasks.pharmacyLowStockSchedulerTask,
      tasks.pharmacyExpirySchedulerTask,
    );
  }

  it('does not schedule intervals when disabled', () => {
    process.env.JOB_SCHEDULER_ENABLED = 'false';
    const service = buildService();
    service.onModuleInit();
    expect(schedulerRegistry.addInterval).not.toHaveBeenCalled();
  });

  it('does not start a tick from a queued interval callback after shutdown begins', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    mockLeaderLockGranted();

    let intervalCallback: (() => void) | undefined;
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockImplementation((handler: TimerHandler) => {
        intervalCallback = handler as () => void;
        return 1 as unknown as ReturnType<typeof setInterval>;
      });

    const service = buildService();
    service.onModuleInit();
    expect(intervalCallback).toBeDefined();

    intervalCallback!();
    await Promise.resolve();
    expect(withDedicatedSchedulerLeaderLock).toHaveBeenCalledTimes(1);

    withDedicatedSchedulerLeaderLock.mockClear();
    await service.onModuleDestroy();

    intervalCallback!();
    await Promise.resolve();
    expect(withDedicatedSchedulerLeaderLock).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
  });

  it('returns early from runTick when disabled', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'false';
    const service = buildService();
    const result = await service.runTick(new Date('2026-10-04T18:42:10Z'));
    expect(result.tasksRun).toBe(0);
    expect(result.leaderAcquired).toBe(false);
  });

  it('skips runTick when a previous tick is still in flight', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID = 'hospital-1';

    let releaseLeaderWork: (() => void) | undefined;
    const leaderGate = new Promise<void>((resolve) => {
      releaseLeaderWork = resolve;
    });

    withDedicatedSchedulerLeaderLock.mockImplementation(
      async (_lockKey: string, fn: () => Promise<void>) => {
        await leaderGate;
        await fn();
        return { acquired: true };
      },
    );

    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = { $executeRaw: jest.fn().mockResolvedValue(0) };
        await callback(tx);
      }),
    };

    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(new SchedulerTestNoopTask());

    const service = new JobSchedulerService(
      prisma as never,
      { enqueueWithClient: jest.fn().mockResolvedValue({ id: 'job-1' }) } as never,
      taskRegistry,
      schedulerRegistry,
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );

    const tickAt = new Date('2026-10-04T18:42:10Z');
    const first = service.runTick(tickAt);
    const second = await service.runTick(tickAt);

    expect(second.tasksRun).toBe(0);
    expect(second.leaderAcquired).toBe(false);
    expect(withDedicatedSchedulerLeaderLock).toHaveBeenCalledTimes(1);

    releaseLeaderWork!();
    const firstResult = await first;
    expect(firstResult.leaderAcquired).toBe(true);
    expect(withDedicatedSchedulerLeaderLock).toHaveBeenCalledTimes(1);
  });

  it('skips task work when advisory lock is unavailable', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID = 'hospital-1';

    const task: SchedulerTask = {
      name: 'unit-task',
      run: jest.fn().mockResolvedValue(undefined),
    };
    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(task);

    mockLeaderLockDenied();

    const service = new JobSchedulerService(
      { $transaction: jest.fn() } as never,
      { enqueueWithClient: jest.fn() } as never,
      taskRegistry,
      schedulerRegistry,
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );

    const result = await service.runTick(new Date('2026-10-04T18:42:10Z'));
    expect(result.leaderAcquired).toBe(false);
    expect(task.run).not.toHaveBeenCalled();
  });

  it('runs tasks when leader lock is acquired and enqueues via JobService', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID = 'hospital-1';

    const enqueueWithClient = jest.fn().mockResolvedValue({ id: 'job-1' });
    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(new SchedulerTestNoopTask());

    mockLeaderLockGranted();

    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<void>, options?: { timeout?: number }) => {
          expect(options?.timeout).toBe(5_000);
          const tx = {
            marker: 'task-tx',
            $executeRaw: jest.fn().mockResolvedValue(0),
          };
          await callback(tx);
        },
      ),
    };

    const service = new JobSchedulerService(
      prisma as never,
      { enqueueWithClient } as never,
      taskRegistry,
      schedulerRegistry,
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );

    const tickAt = new Date('2026-10-04T18:42:10Z');
    const result = await service.runTick(tickAt);

    expect(result.leaderAcquired).toBe(true);
    expect(result.tasksRun).toBe(1);
    expect(enqueueWithClient).toHaveBeenCalledWith(
      expect.objectContaining({ marker: 'task-tx' }),
      expect.objectContaining({
        hospitalId: 'hospital-1',
        type: SCHEDULER_TEST_NOOP_JOB_TYPE,
        idempotencyKey: 'scheduler.test.noop:2026-10-04T18:42Z',
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(withDedicatedSchedulerLeaderLock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ orchestrationTimeoutMs: 120_000 }),
    );
  });

  it('runs per-hospital scheduler tasks in one transaction per hospital', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';

    const consentTask = new AbdmConsentExpireSchedulerTask();
    const runSpy = jest.spyOn(consentTask, 'run').mockResolvedValue(undefined);

    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(consentTask);

    mockLeaderLockGranted();

    const prisma = {
      hospital: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'hospital-a' }, { id: 'hospital-b' }]),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<void>, options?: { timeout?: number }) => {
          expect(options?.timeout).toBe(5_000);
          const tx = { $executeRaw: jest.fn().mockResolvedValue(0) };
          await callback(tx);
        },
      ),
    };

    const service = new JobSchedulerService(
      prisma as never,
      { enqueueWithClient: jest.fn() } as never,
      taskRegistry,
      schedulerRegistry,
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );

    const result = await service.runTick(new Date('2026-10-04T18:42:10Z'));

    expect(result.leaderAcquired).toBe(true);
    expect(result.tasksRun).toBe(1);
    expect(prisma.hospital.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.hospital.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(runSpy).toHaveBeenCalledTimes(2);

    runSpy.mockRestore();
  });

  it('continues after a task failure', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID = 'hospital-1';

    const failing: SchedulerTask = {
      name: 'failing-task',
      run: jest.fn().mockRejectedValue(new Error('task failed')),
    };
    const succeeding: SchedulerTask = {
      name: 'succeeding-task',
      run: jest.fn().mockResolvedValue(undefined),
    };
    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(failing);
    taskRegistry.register(succeeding);

    mockLeaderLockGranted();

    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = { $executeRaw: jest.fn().mockResolvedValue(0) };
        await callback(tx);
      }),
    };

    const service = new JobSchedulerService(
      prisma as never,
      { enqueueWithClient: jest.fn() } as never,
      taskRegistry,
      schedulerRegistry,
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );

    const result = await service.runTick(new Date('2026-10-04T18:42:10Z'));
    expect(result.taskOutcomes).toEqual([
      { name: 'failing-task', outcome: 'failed' },
      { name: 'succeeding-task', outcome: 'success' },
    ]);
    expect(result.tasksRun).toBe(1);
    expect(result.outcome).toBe('partial');
  });

  it('does not register business scheduler handlers', () => {
    const registry = new SchedulerTaskRegistry();
    expect(registry.list()).toHaveLength(0);
  });

  it('runs consent expiry task without JOB_SCHEDULER_TEST_HOSPITAL_ID', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    delete process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID;

    const consentTask = new AbdmConsentExpireSchedulerTask();
    const runSpy = jest.spyOn(consentTask, 'run').mockResolvedValue(undefined);

    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(consentTask);

    mockLeaderLockGranted();

    const prisma = {
      hospital: {
        findMany: jest.fn().mockResolvedValue([{ id: 'hospital-scope-1' }]),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = { $executeRaw: jest.fn().mockResolvedValue(0) };
        await callback(tx);
      }),
    };

    const service = new JobSchedulerService(
      prisma as never,
      { enqueueWithClient: jest.fn() } as never,
      taskRegistry,
      schedulerRegistry,
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );

    const result = await service.runTick(new Date('2026-10-04T18:42:10Z'));

    expect(result.leaderAcquired).toBe(true);
    expect(result.tasksRun).toBe(1);
    expect(result.taskOutcomes).toEqual([
      { name: 'abdm-consent-expire', outcome: 'success' },
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: 'hospital-scope-1' }),
    );
  });

  it('skips test noop at runTick when JOB_SCHEDULER_TEST_HOSPITAL_ID is unset', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    delete process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID;

    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(new SchedulerTestNoopTask());

    mockLeaderLockGranted();

    const enqueueWithClient = jest.fn();

    const service = new JobSchedulerService(
      { $transaction: jest.fn() } as never,
      { enqueueWithClient } as never,
      taskRegistry,
      schedulerRegistry,
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );

    const result = await service.runTick(new Date('2026-10-04T18:42:10Z'));

    expect(result.tasksRun).toBe(0);
    expect(enqueueWithClient).not.toHaveBeenCalled();
  });
});

describe('JobSchedulerService (integration)', () => {
  const realLeaderLock = jest.requireActual<
    typeof schedulerLeaderLockPg
  >('./scheduler-leader-lock-pg.util');

  const prisma = new PrismaClient();
  let dbAvailable = false;
  let hospitalId: string;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const originalEnv = { ...process.env };
  const integrationSchedulerServices: JobSchedulerService[] = [];

  /** Mirrors Nest SchedulerRegistry so onModuleDestroy clears real setInterval handles. */
  function createIntegrationSchedulerRegistry(): SchedulerRegistry {
    const intervals = new Map<string, ReturnType<typeof setInterval>>();
    return {
      addInterval: jest.fn((name: string, handle: ReturnType<typeof setInterval>) => {
        intervals.set(name, handle);
      }),
      deleteInterval: jest.fn((name: string) => {
        const handle = intervals.get(name);
        if (handle) {
          clearInterval(handle);
          intervals.delete(name);
        }
      }),
    } as unknown as SchedulerRegistry;
  }

  function applyIntegrationSchedulerEnv(): void {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID = hospitalId;
    process.env.JOB_SCHEDULER_LEADER_LOCK_KEY = `medios:job-scheduler:leader:jest:${runId}`;
    process.env.JOB_CONSENT_EXPIRE_SCHEDULER_ENABLED = 'false';
    process.env.JOB_BILLING_PAYMENT_RECONCILE_SCHEDULER_ENABLED = 'false';
    process.env.JOB_BILLING_REFUND_RECONCILE_SCHEDULER_ENABLED = 'false';
    process.env.JOB_APPOINTMENT_REMINDER_24H_SCHEDULER_ENABLED = 'false';
    process.env.JOB_PRIVACY_RETENTION_SCHEDULER_ENABLED = 'false';
    process.env.JOB_PATIENT_AT_RISK_SCHEDULER_ENABLED = 'false';
    process.env.JOB_ATTENDANCE_MONTHLY_SUMMARY_SCHEDULER_ENABLED = 'false';
    process.env.JOB_PHARMACY_LOW_STOCK_SCHEDULER_ENABLED = 'false';
    process.env.JOB_PHARMACY_EXPIRY_SCHEDULER_ENABLED = 'false';
    process.env.JOB_SCHEDULER_TEST_NOOP_ENABLED = 'false';
  }

  beforeAll(async () => {
    (
      schedulerLeaderLockPg.withDedicatedSchedulerLeaderLock as jest.Mock
    ).mockImplementation(realLeaderLock.withDedicatedSchedulerLeaderLock);
    (
      schedulerLeaderLockPg.isSchedulerLeaderLockAvailable as jest.Mock
    ).mockImplementation(realLeaderLock.isSchedulerLeaderLockAvailable);
    (
      schedulerLeaderLockPg.shutdownSchedulerLeaderLockPool as jest.Mock
    ).mockImplementation(realLeaderLock.shutdownSchedulerLeaderLockPool);

    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    process.env.JOB_SCHEDULER_LEADER_LOCK_KEY = `medios:job-scheduler:leader:jest:${runId}`;

    const hospital = await prisma.hospital.create({
      data: {
        name: 'Scheduler Test Hospital',
        code: `SCHED-${runId}`,
      },
    });
    hospitalId = hospital.id;
  });

  afterAll(async () => {
    await realLeaderLock.resetSchedulerLeaderLockPoolForTests();
    if (!dbAvailable) {
      return;
    }
    await prisma.job.deleteMany({
      where: { hospitalId, type: SCHEDULER_TEST_NOOP_JOB_TYPE },
    });
    await prisma.hospital.delete({ where: { id: hospitalId } });
    await prisma.$disconnect();
    process.env = originalEnv;
  });

  beforeEach(async () => {
    if (!dbAvailable) {
      return;
    }
    applyIntegrationSchedulerEnv();
    await prisma.job.deleteMany({
      where: { hospitalId, type: SCHEDULER_TEST_NOOP_JOB_TYPE },
    });
  });

  afterEach(() => {
    for (const service of integrationSchedulerServices) {
      service.onModuleDestroy();
    }
    integrationSchedulerServices.length = 0;
  });

  function trackSchedulerService(service: JobSchedulerService): JobSchedulerService {
    integrationSchedulerServices.push(service);
    return service;
  }

  function buildIntegrationService(): JobSchedulerService {
    applyIntegrationSchedulerEnv();

    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(new SchedulerTestNoopTask());
    const schedulerRegistry = createIntegrationSchedulerRegistry();

    return new JobSchedulerService(
      prisma as never,
      new JobService(prisma as never),
      taskRegistry,
      schedulerRegistry,
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );
  }

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  itWithDb('creates one job per UTC window across duplicate ticks', async () => {
    const service = buildIntegrationService();
    const tickAt = new Date('2026-10-04T18:42:15Z');
    const windowKey = formatUtcMinuteWindow(tickAt);

    const first = await service.runTick(tickAt);
    expect(first.leaderAcquired).toBe(true);
    expect(first.tasksRun).toBe(1);

    const second = await service.runTick(tickAt);
    expect(second.leaderAcquired).toBe(true);
    expect(second.tasksRun).toBe(1);

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId,
        type: SCHEDULER_TEST_NOOP_JOB_TYPE,
        idempotencyKey: `${SCHEDULER_TEST_NOOP_JOB_TYPE}:${windowKey}`,
      },
    });
    expect(jobs).toHaveLength(1);
  });

  itWithDb(
    'elects only one leader when two scheduler instances run concurrently',
    async () => {
      let releaseSlowTask: (() => void) | undefined;
      const slowTaskGate = new Promise<void>((resolve) => {
        releaseSlowTask = resolve;
      });
      const slowTask: SchedulerTask = {
        name: 'slow-gate-task',
        run: async () => {
          await slowTaskGate;
        },
      };

      function buildSlowIntegrationService(): JobSchedulerService {
        applyIntegrationSchedulerEnv();
        const taskRegistry = new SchedulerTaskRegistry();
        taskRegistry.register(slowTask);
        return new JobSchedulerService(
          prisma as never,
          new JobService(prisma as never),
          taskRegistry,
          createIntegrationSchedulerRegistry(),
          new SchedulerTestNoopTask(),
          new AbdmConsentExpireSchedulerTask(),
          new BillingPaymentReconcileSchedulerTask(),
          new BillingRefundReconcileSchedulerTask(),
          new AppointmentReminderSchedulerTask({} as never),
          new PrivacyRetentionSchedulerTask(),
          new PatientAtRiskSchedulerTask(),
          new AttendanceMonthlySummarySchedulerTask(),
          new PharmacyLowStockSchedulerTask(),
          new PharmacyExpirySchedulerTask(),
        );
      }

      const serviceA = buildSlowIntegrationService();
      const serviceB = buildSlowIntegrationService();
      const tickAt = new Date('2026-10-04T19:01:10Z');
      const lockKey = resolveJobSchedulerLeaderLockKey();

      const firstPromise = serviceA.runTick(tickAt);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (!(await realLeaderLock.isSchedulerLeaderLockAvailable(lockKey))) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(await realLeaderLock.isSchedulerLeaderLockAvailable(lockKey)).toBe(
        false,
      );

      const secondPromise = serviceB.runTick(tickAt);
      const second = await secondPromise;
      expect(second.leaderAcquired).toBe(false);

      releaseSlowTask!();
      const first = await firstPromise;
      expect(first.leaderAcquired).toBe(true);
      expect(
        await realLeaderLock.isSchedulerLeaderLockAvailable(lockKey),
      ).toBe(true);
    },
  );

  itWithDb('releases leader lock after a successful tick', async () => {
    const service = buildIntegrationService();
    const lockKey = resolveJobSchedulerLeaderLockKey();
    const tickAt = new Date('2026-10-04T19:10:10Z');

    const result = await service.runTick(tickAt);
    expect(result.leaderAcquired).toBe(true);
    expect(
      await realLeaderLock.isSchedulerLeaderLockAvailable(lockKey),
    ).toBe(true);
  });

  itWithDb('releases leader lock after a task failure', async () => {
    const lockKey = resolveJobSchedulerLeaderLockKey();
    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register({
      name: 'bad-enqueue-task',
      run: async (context: SchedulerExecutionContext) => {
        await context.jobService.enqueueWithClient(context.transaction, {
          hospitalId: '00000000-0000-4000-8000-000000009999',
          type: SCHEDULER_TEST_NOOP_JOB_TYPE,
          idempotencyKey: `${SCHEDULER_TEST_NOOP_JOB_TYPE}:${context.windowKey}`,
          payload: { purpose: 'should-fail-fk' },
          maxAttempts: 1,
        });
      },
    });
    applyIntegrationSchedulerEnv();
    const service = new JobSchedulerService(
      prisma as never,
      new JobService(prisma as never),
      taskRegistry,
      createIntegrationSchedulerRegistry(),
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );

    const tickAt = new Date('2026-10-04T19:12:10Z');
    const result = await service.runTick(tickAt);
    expect(result.taskOutcomes[0]?.outcome).toBe('failed');
    expect(
      await realLeaderLock.isSchedulerLeaderLockAvailable(lockKey),
    ).toBe(true);
  });

  itWithDb(
    'orchestration timeout reports failure while lock blocks overlap until work settles',
    async () => {
      process.env.JOB_SCHEDULER_TICK_TRANSACTION_TIMEOUT_MS = '50';
      const lockKey = resolveJobSchedulerLeaderLockKey();
      let releaseWork: (() => void) | undefined;
      const workGate = new Promise<void>((resolve) => {
        releaseWork = resolve;
      });

      const taskRegistry = new SchedulerTaskRegistry();
      taskRegistry.register({
        name: 'slow-gated-task',
        run: () => workGate,
      });
      applyIntegrationSchedulerEnv();

      const leaderService = new JobSchedulerService(
        prisma as never,
        new JobService(prisma as never),
        taskRegistry,
        createIntegrationSchedulerRegistry(),
        new SchedulerTestNoopTask(),
        new AbdmConsentExpireSchedulerTask(),
        new BillingPaymentReconcileSchedulerTask(),
        new BillingRefundReconcileSchedulerTask(),
        new AppointmentReminderSchedulerTask({} as never),
        new PrivacyRetentionSchedulerTask(),
        new PatientAtRiskSchedulerTask(),
        new AttendanceMonthlySummarySchedulerTask(),
        new PharmacyLowStockSchedulerTask(),
        new PharmacyExpirySchedulerTask(),
      );

      const tickAt = new Date('2026-10-04T19:20:10Z');
      const leaderTick = leaderService.runTick(tickAt);
      await new Promise((resolve) => setTimeout(resolve, 80));

      const timedOut = await leaderTick;
      expect(timedOut.leaderAcquired).toBe(true);
      expect(timedOut.outcome).toBe('failed');
      expect(
        await realLeaderLock.isSchedulerLeaderLockAvailable(lockKey),
      ).toBe(false);

      const overlapping = buildIntegrationService();
      const blocked = await overlapping.runTick(new Date('2026-10-04T19:20:15Z'));
      expect(blocked.leaderAcquired).toBe(false);

      releaseWork!();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(
        await realLeaderLock.isSchedulerLeaderLockAvailable(lockKey),
      ).toBe(true);

      delete process.env.JOB_SCHEDULER_TICK_TRANSACTION_TIMEOUT_MS;
      const followUp = buildIntegrationService();
      const next = await followUp.runTick(new Date('2026-10-04T19:21:10Z'));
      expect(next.leaderAcquired).toBe(true);
    },
  );

  itWithDb('onModuleDestroy waits for active tick work before pool shutdown', async () => {
    let releaseWork: (() => void) | undefined;
    const workGate = new Promise<void>((resolve) => {
      releaseWork = resolve;
    });

    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register({
      name: 'shutdown-gated-task',
      run: () => workGate,
    });
    applyIntegrationSchedulerEnv();

    const service = trackSchedulerService(
      new JobSchedulerService(
        prisma as never,
        new JobService(prisma as never),
        taskRegistry,
        createIntegrationSchedulerRegistry(),
        new SchedulerTestNoopTask(),
        new AbdmConsentExpireSchedulerTask(),
        new BillingPaymentReconcileSchedulerTask(),
        new BillingRefundReconcileSchedulerTask(),
        new AppointmentReminderSchedulerTask({} as never),
        new PrivacyRetentionSchedulerTask(),
        new PatientAtRiskSchedulerTask(),
        new AttendanceMonthlySummarySchedulerTask(),
        new PharmacyLowStockSchedulerTask(),
        new PharmacyExpirySchedulerTask(),
      ),
    );

    const tickAt = new Date('2026-10-04T19:25:10Z');
    const tickPromise = service.runTick(tickAt);
    await new Promise((resolve) => setTimeout(resolve, 20));

    let destroySettled = false;
    const destroyPromise = service.onModuleDestroy().then(() => {
      destroySettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(destroySettled).toBe(false);

    releaseWork!();
    await tickPromise;
    await destroyPromise;
    expect(destroySettled).toBe(true);
  });

  itWithDb('allows a later tick after enqueue failure in a previous tick', async () => {
    const taskRegistry = new SchedulerTaskRegistry();
    const badTask: SchedulerTask = {
      name: 'bad-enqueue-task',
      run: async (context: SchedulerExecutionContext) => {
        await context.jobService.enqueueWithClient(context.transaction, {
          hospitalId: '00000000-0000-4000-8000-000000009999',
          type: SCHEDULER_TEST_NOOP_JOB_TYPE,
          idempotencyKey: `${SCHEDULER_TEST_NOOP_JOB_TYPE}:${context.windowKey}`,
          payload: { purpose: 'should-fail-fk' },
          maxAttempts: 1,
        });
      },
    };
    taskRegistry.register(badTask);

    applyIntegrationSchedulerEnv();

    const service = new JobSchedulerService(
      prisma as never,
      new JobService(prisma as never),
      taskRegistry,
      createIntegrationSchedulerRegistry(),
      new SchedulerTestNoopTask(),
      new AbdmConsentExpireSchedulerTask(),
      new BillingPaymentReconcileSchedulerTask(),
      new BillingRefundReconcileSchedulerTask(),
      new AppointmentReminderSchedulerTask({} as never),
      new PrivacyRetentionSchedulerTask(),
      new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
    );

    const tickAt = new Date('2026-10-04T20:15:10Z');
    const first = await service.runTick(tickAt);
    expect(first.taskOutcomes[0]?.outcome).toBe('failed');

    taskRegistry.register(new SchedulerTestNoopTask());
    const second = await service.runTick(tickAt);
    expect(second.leaderAcquired).toBe(true);
    expect(second.tasksRun).toBeGreaterThanOrEqual(1);
  });

  itWithDb(
    'onModuleInit registers consent task and runTick executes it without TEST_HOSPITAL_ID',
    async () => {
      applyIntegrationSchedulerEnv();
      delete process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID;
      process.env.JOB_CONSENT_EXPIRE_SCHEDULER_ENABLED = 'true';

      const runSpy = jest
        .spyOn(AbdmConsentExpireSchedulerTask.prototype, 'run')
        .mockResolvedValue(undefined);
      const findManySpy = jest
        .spyOn(prisma.hospital, 'findMany')
        .mockResolvedValue([{ id: hospitalId }] as never);

      const taskRegistry = new SchedulerTaskRegistry();
      const service = trackSchedulerService(
        new JobSchedulerService(
          prisma as never,
          new JobService(prisma as never),
          taskRegistry,
          createIntegrationSchedulerRegistry(),
          new SchedulerTestNoopTask(),
          new AbdmConsentExpireSchedulerTask(),
          new BillingPaymentReconcileSchedulerTask(),
          new BillingRefundReconcileSchedulerTask(),
          new AppointmentReminderSchedulerTask({} as never),
          new PrivacyRetentionSchedulerTask(),
          new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
        ),
      );
      service.onModuleInit();

      try {
        expect(taskRegistry.list().map((task) => task.name)).toEqual([
          'abdm-consent-expire',
        ]);

        const tickAt = new Date('2026-10-04T21:30:00Z');
        const result = await service.runTick(tickAt);

        expect(result.leaderAcquired).toBe(true);
        expect(result.tasksRun).toBe(1);
        expect(result.taskOutcomes).toEqual([
          { name: 'abdm-consent-expire', outcome: 'success' },
        ]);
        expect(findManySpy).toHaveBeenCalled();
        expect(runSpy).toHaveBeenCalledTimes(1);
        expect(runSpy).toHaveBeenCalledWith(
          expect.objectContaining({ hospitalId }),
        );
      } finally {
        service.onModuleDestroy();
        runSpy.mockRestore();
        findManySpy.mockRestore();
      }
    },
  );

  itWithDb('does not register consent task when consent scheduler is disabled', async () => {
    applyIntegrationSchedulerEnv();
    delete process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID;

    const taskRegistry = new SchedulerTaskRegistry();
    const service = trackSchedulerService(
      new JobSchedulerService(
        prisma as never,
        new JobService(prisma as never),
        taskRegistry,
        createIntegrationSchedulerRegistry(),
        new SchedulerTestNoopTask(),
        new AbdmConsentExpireSchedulerTask(),
        new BillingPaymentReconcileSchedulerTask(),
        new BillingRefundReconcileSchedulerTask(),
        new AppointmentReminderSchedulerTask({} as never),
        new PrivacyRetentionSchedulerTask(),
        new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      ),
    );
    service.onModuleInit();

    try {
      expect(taskRegistry.list()).toHaveLength(0);

      const tickAt = new Date('2026-10-04T22:00:00Z');
      const result = await service.runTick(tickAt);
      expect(result.tasksRun).toBe(0);
    } finally {
      service.onModuleDestroy();
    }
  });

  itWithDb(
    'does not register test noop when enabled but TEST_HOSPITAL_ID is unset',
    async () => {
      applyIntegrationSchedulerEnv();
      delete process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID;
      process.env.JOB_SCHEDULER_TEST_NOOP_ENABLED = 'true';

      const taskRegistry = new SchedulerTaskRegistry();
      const service = trackSchedulerService(
        new JobSchedulerService(
          prisma as never,
          new JobService(prisma as never),
          taskRegistry,
          createIntegrationSchedulerRegistry(),
          new SchedulerTestNoopTask(),
          new AbdmConsentExpireSchedulerTask(),
          new BillingPaymentReconcileSchedulerTask(),
          new BillingRefundReconcileSchedulerTask(),
          new AppointmentReminderSchedulerTask({} as never),
          new PrivacyRetentionSchedulerTask(),
          new PatientAtRiskSchedulerTask(),
      new AttendanceMonthlySummarySchedulerTask(),
      new PharmacyLowStockSchedulerTask(),
      new PharmacyExpirySchedulerTask(),
        ),
      );
      service.onModuleInit();

      try {
        expect(taskRegistry.list().map((task) => task.name)).toEqual([]);
      } finally {
        service.onModuleDestroy();
      }
    },
  );
});
