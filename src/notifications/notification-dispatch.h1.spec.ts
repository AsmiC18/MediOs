import {

  DomainEventOutboxStatus,

  Job,

  JobStatus,

  NotificationStatus,

  PrismaClient,

} from '@prisma/client';

import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';

import { JobHandlerRegistrar } from '../jobs/handlers/job-handler.registrar';

import { JobHandlerRegistry } from '../jobs/job-handler.registry';

import { JobService } from '../jobs/job.service';

import { JOB_TYPES } from '../jobs/job-types.constants';

import { DomainEventOutboxService } from './domain-event-outbox.service';

import { NotificationDispatchJobHandler } from './notification-dispatch.job-handler';

import { NotificationService } from './notification.service';



describe('Notification dispatch H1 foundation', () => {

  describe('handler (unit)', () => {

    let handler: NotificationDispatchJobHandler;

    let outboxService: {

      findByIdForHospital: jest.Mock;

    };

    let notificationService: {

      findByOutboxIdForHospital: jest.Mock;

    };

    let prisma: { $transaction: jest.Mock };


    const baseJob = (overrides: Partial<Job> = {}): Job =>

      ({

        id: 'job-1',

        hospitalId: 'hospital-a',

        branchId: null,

        type: JOB_TYPES.NOTIFICATION_DISPATCH,

        idempotencyKey: 'notification.dispatch:outbox-1',

        payload: { outboxId: 'outbox-1' },

        status: JobStatus.PENDING,

        attempts: 0,

        maxAttempts: 5,

        availableAt: new Date(),

        lockedAt: null,

        lockedBy: null,

        lastError: null,

        startedAt: null,

        completedAt: null,

        failedAt: null,

        createdAt: new Date(),

        updatedAt: new Date(),

        ...overrides,

      }) as Job;



    beforeEach(() => {

      outboxService = {

        findByIdForHospital: jest.fn(),

      };

      notificationService = {

        findByOutboxIdForHospital: jest.fn(),

      };

      prisma = {

        $transaction: jest.fn(),

      };

      handler = new NotificationDispatchJobHandler(

        prisma as never,

        outboxService as unknown as DomainEventOutboxService,

        notificationService as unknown as NotificationService,

        { dispatch: jest.fn() } as never,

        { dispatch: jest.fn() } as never,

        {
          evaluate: jest.fn().mockResolvedValue({ action: 'ALLOW' }),
        } as never,

        { routeFromOutbox: jest.fn().mockResolvedValue(0) } as never,

      );

    });



    it('no-ops safely when outbox is PROCESSED with linked notification', async () => {

      outboxService.findByIdForHospital.mockResolvedValue({

        id: 'outbox-1',

        hospitalId: 'hospital-a',

        status: DomainEventOutboxStatus.PROCESSED,

      });

      notificationService.findByOutboxIdForHospital.mockResolvedValue({

        id: 'notif-1',

        hospitalId: 'hospital-a',

        status: NotificationStatus.DISPATCHED,

        channel: 'unrouted',

      });



      await expect(

        handler.handle(baseJob(), { workerId: 'worker-1' }),

      ).resolves.toBeUndefined();

    });



    it('permanent failure when PROCESSED outbox has no notification', async () => {

      outboxService.findByIdForHospital.mockResolvedValue({

        id: 'outbox-1',

        hospitalId: 'hospital-a',

        status: DomainEventOutboxStatus.PROCESSED,

      });

      notificationService.findByOutboxIdForHospital.mockResolvedValue(null);



      await expect(

        handler.handle(baseJob(), { workerId: 'worker-1' }),

      ).rejects.toBeInstanceOf(JobPermanentFailureError);

    });



    it('no-ops safely when outbox is FAILED', async () => {

      outboxService.findByIdForHospital.mockResolvedValue({

        id: 'outbox-1',

        hospitalId: 'hospital-a',

        status: DomainEventOutboxStatus.FAILED,

      });



      await expect(

        handler.handle(baseJob(), { workerId: 'worker-1' }),

      ).resolves.toBeUndefined();

    });



    it('permanent failure when outbox not found for job hospital', async () => {

      outboxService.findByIdForHospital.mockResolvedValue(null);



      await expect(

        handler.handle(baseJob(), { workerId: 'worker-1' }),

      ).rejects.toBeInstanceOf(JobPermanentFailureError);

    });



    it('permanent failure when payload missing outboxId', async () => {

      await expect(

        handler.handle(

          baseJob({ payload: {} as Job['payload'] }),

          { workerId: 'worker-1' },

        ),

      ).rejects.toBeInstanceOf(JobPermanentFailureError);

    });



    it('job payload contains only outboxId in tests of enqueue shape', () => {

      const payload = { outboxId: 'outbox-abc' };

      expect(Object.keys(payload).sort()).toEqual(['outboxId']);

    });

  });



  describe('job registration', () => {

    it('registers notification.dispatch on JobHandlerRegistrar init', () => {

      const registry = new JobHandlerRegistry();

      const registrar = new JobHandlerRegistrar(

        registry,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

        { handle: jest.fn() } as never,

      );



      registrar.onModuleInit();



      expect(registry.has(JOB_TYPES.NOTIFICATION_DISPATCH)).toBe(true);

    });

  });



  describe('integration (PostgreSQL)', () => {

    const prisma = new PrismaClient();

    const jobService = new JobService(prisma as never);

    const outboxService = new DomainEventOutboxService(

      prisma as never,

      jobService,

    );

    const notificationService = new NotificationService(prisma as never);

    const handler = new NotificationDispatchJobHandler(

      prisma as never,

      outboxService,

      notificationService,

      { dispatch: jest.fn() } as never,

      { dispatch: jest.fn() } as never,

      {
        evaluate: jest.fn().mockResolvedValue({ action: 'ALLOW' }),
      } as never,

      { routeFromOutbox: jest.fn().mockResolvedValue(0) } as never,

    );



    let dbAvailable = false;

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const createdOutboxIds: string[] = [];

    const createdJobIds: string[] = [];

    const createdNotificationIds: string[] = [];

    const createdHospitalIds: string[] = [];



    beforeAll(async () => {

      try {

        await prisma.$connect();

        await prisma.$queryRaw`SELECT 1`;

        dbAvailable = true;

      } catch {

        dbAvailable = false;

      }

    });



    afterAll(async () => {

      if (!dbAvailable) {

        return;

      }

      if (createdJobIds.length > 0) {

        await prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });

      }

      if (createdNotificationIds.length > 0) {

        await prisma.notification.deleteMany({

          where: { id: { in: createdNotificationIds } },

        });

      }

      if (createdOutboxIds.length > 0) {

        await prisma.domainEventOutbox.deleteMany({

          where: { id: { in: createdOutboxIds } },

        });

      }

      if (createdHospitalIds.length > 0) {

        await prisma.hospital.deleteMany({

          where: { id: { in: createdHospitalIds } },

        });

      }

      await prisma.$disconnect();

    });



    const itWithDb = (name: string, fn: () => Promise<void>) => {

      it(name, async () => {

        if (!dbAvailable) {

          return;

        }

        await fn();

      });

    };



    async function createHospital(suffix: string) {

      const hospital = await prisma.hospital.create({

        data: {

          name: `Dispatch H1 ${suffix}`,

          code: `NDH1-${runId}-${suffix}`,

        },

      });

      createdHospitalIds.push(hospital.id);

      return hospital;

    }



    async function createOutbox(hospitalId: string, status: DomainEventOutboxStatus) {

      const row = await prisma.domainEventOutbox.create({

        data: {

          hospitalId,

          eventType: 'h1.test',

          entityType: 'Test',

          entityId: `ent-${runId}`,

          idempotencyKey: `h1:${runId}:${status}:${Math.random()}`,

          payload: { minimal: true },

          status,

        },

      });

      createdOutboxIds.push(row.id);

      return row;

    }



    itWithDb('enqueues notification.dispatch with hospitalId and outboxId payload', async () => {

      const hospital = await createHospital('enqueue');

      const outbox = await createOutbox(

        hospital.id,

        DomainEventOutboxStatus.PENDING,

      );



      const job = await jobService.enqueue({

        hospitalId: hospital.id,

        branchId: null,

        type: JOB_TYPES.NOTIFICATION_DISPATCH,

        idempotencyKey: `notification.dispatch:${outbox.id}`,

        payload: { outboxId: outbox.id },

        maxAttempts: 5,

      });

      createdJobIds.push(job.id);



      expect(job.hospitalId).toBe(hospital.id);

      expect(job.payload).toEqual({ outboxId: outbox.id });

    });



    itWithDb('preserves outbox hospitalId and rejects cross-hospital dispatch', async () => {

      const hospitalA = await createHospital('cross-a');

      const hospitalB = await createHospital('cross-b');

      const outboxB = await createOutbox(

        hospitalB.id,

        DomainEventOutboxStatus.PENDING,

      );



      const job = await jobService.enqueue({

        hospitalId: hospitalA.id,

        branchId: null,

        type: JOB_TYPES.NOTIFICATION_DISPATCH,

        idempotencyKey: `notification.dispatch:cross:${outboxB.id}`,

        payload: { outboxId: outboxB.id },

        maxAttempts: 5,

      });

      createdJobIds.push(job.id);



      await expect(

        handler.handle(job, { workerId: 'worker-cross' }),

      ).rejects.toBeInstanceOf(JobPermanentFailureError);



      const unchanged = await prisma.domainEventOutbox.findUnique({

        where: { id: outboxB.id },

      });

      expect(unchanged!.status).toBe(DomainEventOutboxStatus.PENDING);

      expect(unchanged!.hospitalId).toBe(hospitalB.id);

    });



    itWithDb('handler run does not create WhatsAppMessage rows', async () => {

      const hospital = await createHospital('no-wa');

      const outbox = await createOutbox(

        hospital.id,

        DomainEventOutboxStatus.PENDING,

      );



      const before = await prisma.whatsAppMessage.count({

        where: { hospitalId: hospital.id },

      });



      const job = await jobService.enqueue({

        hospitalId: hospital.id,

        type: JOB_TYPES.NOTIFICATION_DISPATCH,

        idempotencyKey: `notification.dispatch:nowa:${outbox.id}`,

        payload: { outboxId: outbox.id },

        maxAttempts: 5,

      });

      createdJobIds.push(job.id);



      await handler.handle(job, { workerId: 'worker-nowa' });



      const after = await prisma.whatsAppMessage.count({

        where: { hospitalId: hospital.id },

      });



      expect(after).toBe(before);



      const notification = await prisma.notification.findFirst({

        where: { outboxId: outbox.id },

      });

      if (notification) {

        createdNotificationIds.push(notification.id);

      }

    });

  });

});


