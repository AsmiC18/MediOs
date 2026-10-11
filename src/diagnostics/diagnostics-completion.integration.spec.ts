import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  DiagnosticOrderStatus,
  DomainEventOutboxStatus,
  NotificationStatus,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { notificationIdempotencyKeyForOutbox } from '../notifications/notification-idempotency.util';
import { NOTIFICATION_CHANNEL_UNROUTED } from '../notifications/notification.constants';
import { instantiateNotificationDispatchJobHandler } from '../notifications/notification-dispatch.handler.test-util';
import type { NotificationDispatchJobHandler } from '../notifications/notification-dispatch.job-handler';
import { NotificationPolicyService } from '../notifications/notification-policy.service';
import { NotificationService } from '../notifications/notification.service';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';
import {
  DIAGNOSTIC_ORDER_BILLING_EVENT_TYPE,
} from '../billing/department/department-billing-event.util';
import {
  DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE,
  diagnosticOrderCompletedIdempotencyKey,
} from './diagnostic-order-completed-event.util';
import { DepartmentBillingEnqueueService } from '../billing/department/department-billing-enqueue.service';
import { DiagnosticsService } from './diagnostics.service';

describe('Diagnostic order completion (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;
  let service: DiagnosticsService;
  let dispatchHandler: NotificationDispatchJobHandler;

  const user = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const jobService = new JobService(prisma as never);
    const outboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    const departmentBillingEnqueue = new DepartmentBillingEnqueueService(
      prisma as never,
      outboxService,
      jobService,
      new AuditService(prisma as never),
    );
    service = new DiagnosticsService(
      prisma as never,
      new AuditService(prisma as never),
      outboxService,
      departmentBillingEnqueue,
    );

    const notificationService = new NotificationService(prisma as never);
    dispatchHandler = instantiateNotificationDispatchJobHandler({
      prisma,
      outboxService,
      notificationService,
      policyService: new NotificationPolicyService(
        prisma as never,
        new PatientNotificationPreferenceService(prisma as never),
      ),
    });

    const hospital = await prisma.hospital.create({
      data: { name: `Diag ${runId}`, code: `DG-${runId}` },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Lab', code: `LB-${runId}` },
    });
    branchId = branch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Role-${runId}` },
    });

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Lab Tech',
        email: `diag-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = admin.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Pat',
        lastName: runId,
        phone: `9${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  async function seedOrderReadyToComplete() {
    const encounter = await prisma.clinicalEncounter.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        providerUserId: userId,
        encounterType: ClinicalEncounterType.OPD,
        status: ClinicalEncounterStatus.OPEN,
      },
    });

    const order = await service.createOrder(user(), {
      encounterId: encounter.id,
      tests: [
        {
          testCode: 'CBC',
          testName: 'Complete Blood Count',
          specimenType: 'Blood',
        },
      ],
    });

    await service.collectSample(user(), order.id);
    await service.startProcessing(user(), order.id);

    const item = (
      await prisma.diagnosticOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      })
    ).items[0];

    await service.enterResult(user(), item.id, {
      resultValue: '12.5',
      resultUnit: 'g/dL',
    });

    return order.id;
  }

  it('completes order with outbox and notification.dispatch atomically', async () => {
    if (!dbAvailable) {
      return;
    }

    const orderId = await seedOrderReadyToComplete();

    const completed = await service.completeOrder(user(), orderId);
    expect(completed.status).toBe(DiagnosticOrderStatus.COMPLETED);

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId,
        idempotencyKey: diagnosticOrderCompletedIdempotencyKey(orderId),
      },
    });
    expect(outbox.eventType).toBe(DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE);
    expect(outbox.branchId).toBe(branchId);

    const payload = outbox.payload as Record<string, unknown>;
    expect(payload.patientId).toBe(patientId);
    expect(payload.channel).toBe(NOTIFICATION_CHANNEL_UNROUTED);
    expect(payload.resultValue).toBeUndefined();

    const notificationJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        idempotencyKey: `notification.dispatch:${outbox.id}`,
      },
    });

    const billingOutbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId,
        eventType: DIAGNOSTIC_ORDER_BILLING_EVENT_TYPE,
        entityId: orderId,
      },
    });
    expect(billingOutbox).toBeDefined();

    const billingJobs = await prisma.job.findMany({
      where: {
        hospitalId,
        type: JOB_TYPES.BILLING_DEPARTMENT_PROCESS,
        idempotencyKey: `${JOB_TYPES.BILLING_DEPARTMENT_PROCESS}:${orderId}`,
      },
    });
    expect(billingJobs).toHaveLength(1);

    const job = notificationJob;

    await dispatchHandler.handle(job, { workerId: 'test' });
    await dispatchHandler.handle(job, { workerId: 'test' });

    const notifications = await prisma.notification.findMany({
      where: {
        hospitalId,
        idempotencyKey: notificationIdempotencyKeyForOutbox(outbox.id),
      },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].channel).toBe(NOTIFICATION_CHANNEL_UNROUTED);
    expect(notifications[0].status).toBe(NotificationStatus.PENDING);

    const outboxAfter = await prisma.domainEventOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
    expect(outboxAfter.status).toBe(DomainEventOutboxStatus.PROCESSED);
  });
});
