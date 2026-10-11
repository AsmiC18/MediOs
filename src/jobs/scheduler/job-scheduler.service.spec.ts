jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: {
    forRoot: jest.fn(),
  },
  SchedulerRegistry: jest.fn(),
}));

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
import { resolveJobSchedulerLeaderLockKey } from './scheduler-lock.util';
import { SchedulerTaskRegistry } from './scheduler-task.registry';
import {
  SCHEDULER_TEST_NOOP_JOB_TYPE,
  SchedulerTestNoopTask,
} from './scheduler-test-noop.task';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';
import { formatUtcMinuteWindow } from './scheduler-window.util';

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

  it('returns early from runTick when disabled', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'false';
    const service = buildService();
    const result = await service.runTick(new Date('2026-10-04T18:42:10Z'));
    expect(result.tasksRun).toBe(0);
    expect(result.leaderAcquired).toBe(false);
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

    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ locked: false }]),
          $executeRaw: jest.fn().mockResolvedValue(0),
        };
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
    expect(result.leaderAcquired).toBe(false);
    expect(task.run).not.toHaveBeenCalled();
  });

  it('runs tasks when leader lock is acquired and enqueues via JobService', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID = 'hospital-1';

    const enqueueWithClient = jest.fn().mockResolvedValue({ id: 'job-1' });
    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(new SchedulerTestNoopTask());

    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = {
          marker: 'tx',
          $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
          $executeRaw: jest.fn().mockResolvedValue(0),
        };
        await callback(tx);
      }),
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
      expect.objectContaining({ marker: 'tx' }),
      expect.objectContaining({
        hospitalId: 'hospital-1',
        type: SCHEDULER_TEST_NOOP_JOB_TYPE,
        idempotencyKey: 'scheduler.test.noop:2026-10-04T18:42Z',
      }),
    );
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

    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
          $executeRaw: jest.fn().mockResolvedValue(0),
        };
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

    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
          $executeRaw: jest.fn().mockResolvedValue(0),
        };
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
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it('skips test noop at runTick when JOB_SCHEDULER_TEST_HOSPITAL_ID is unset', async () => {
    process.env.JOB_SCHEDULER_ENABLED = 'true';
    delete process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID;

    const taskRegistry = new SchedulerTaskRegistry();
    taskRegistry.register(new SchedulerTestNoopTask());

    const enqueueWithClient = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
          $executeRaw: jest.fn().mockResolvedValue(0),
        };
        await callback(tx);
      }),
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

    const result = await service.runTick(new Date('2026-10-04T18:42:10Z'));

    expect(result.tasksRun).toBe(0);
    expect(enqueueWithClient).not.toHaveBeenCalled();
  });
});

describe('JobSchedulerService (integration)', () => {
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

  itWithDb('does not run scheduler tasks when advisory lock is held', async () => {
    const service = buildIntegrationService();
    const tickAt = new Date('2026-10-04T19:01:10Z');

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${resolveJobSchedulerLeaderLockKey()}))`;

      const result = await service.runTick(tickAt);
      expect(result.leaderAcquired).toBe(false);
      expect(result.tasksRun).toBe(0);

      const jobs = await tx.job.count({
        where: {
          hospitalId,
          type: SCHEDULER_TEST_NOOP_JOB_TYPE,
          idempotencyKey: `${SCHEDULER_TEST_NOOP_JOB_TYPE}:${formatUtcMinuteWindow(tickAt)}`,
        },
      });
      expect(jobs).toBe(0);
    });
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
        expect(runSpy).toHaveBeenCalledTimes(1);
        expect(runSpy.mock.calls[0]?.[0].hospitalId).toBeUndefined();
      } finally {
        service.onModuleDestroy();
        runSpy.mockRestore();
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
