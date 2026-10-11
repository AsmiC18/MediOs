import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  DomainEventOutboxStatus,
  EmergencyPriority,
  EmergencyVisitStatus,
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
import { NotificationPolicyService } from '../notifications/notification-policy.service';
import { NotificationService } from '../notifications/notification.service';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';
import {
  EMERGENCY_VISIT_ESCALATED_EVENT_TYPE,
  emergencyVisitEscalatedIdempotencyKey,
} from './emergency-visit-escalated-event.util';
import { EmergencyService } from './emergency.service';

describe('Emergency escalation durable notification (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;
  let service: EmergencyService;
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
      dbAvailable = false;
      return;
    }

    const jobService = new JobService(prisma as never);
    const outboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    service = new EmergencyService(
      prisma as never,
      new AuditService(prisma as never),
      outboxService,
      { notifyEscalation: jest.fn().mockResolvedValue(0) } as never,
      { enqueueAfterCommit: jest.fn() } as never,
    );

    const notificationService = new NotificationService(prisma as never);
    const policyService = new NotificationPolicyService(
      prisma as never,
      new PatientNotificationPreferenceService(prisma as never),
    );
    dispatchHandler = instantiateNotificationDispatchJobHandler({
      prisma,
      outboxService,
      notificationService,
      policyService,
    });

    const hospital = await prisma.hospital.create({
      data: { name: `ER Esc ${runId}`, code: `ER-${runId}` },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'ED', code: `ED-${runId}` },
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
        name: 'Triage Nurse',
        email: `er-${runId}@example.com`,
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

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  async function seedVisitWithTriage(suffix: string) {
    const encounter = await prisma.clinicalEncounter.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        providerUserId: userId,
        encounterType: ClinicalEncounterType.EMERGENCY,
        status: ClinicalEncounterStatus.OPEN,
      },
    });

    const visit = await prisma.emergencyVisit.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        encounterId: encounter.id,
        priority: EmergencyPriority.URGENT,
        chiefComplaint: `Complaint ${suffix}`,
        status: EmergencyVisitStatus.TRIAGED,
      },
    });

    const triage = await prisma.triageRecord.create({
      data: {
        hospitalId,
        emergencyVisitId: visit.id,
        assessedByUserId: userId,
        priority: EmergencyPriority.EMERGENCY,
        heartRate: 110,
      },
    });

    return { visit, triage };
  }

  itWithDb('escalation persists outbox and notification.dispatch atomically with triage', async () => {
    const { visit, triage } = await seedVisitWithTriage('a');

    await service.escalate(user(), visit.id, {
      reason: 'Rising lactate',
    });

    const triageRow = await prisma.triageRecord.findUniqueOrThrow({
      where: { id: triage.id },
    });
    expect(triageRow.escalatedAt).not.toBeNull();
    expect(triageRow.escalationReason).toBe('Rising lactate');

    const outboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId,
        eventType: EMERGENCY_VISIT_ESCALATED_EVENT_TYPE,
        entityId: triage.id,
      },
    });
    expect(outboxes).toHaveLength(1);
    expect(outboxes[0].branchId).toBe(branchId);
    expect(outboxes[0].idempotencyKey).toBe(
      emergencyVisitEscalatedIdempotencyKey(triage.id),
    );

    const payload = outboxes[0].payload as Record<string, unknown>;
    expect(payload.emergencyVisitId).toBe(visit.id);
    expect(payload.patientId).toBe(patientId);
    expect(payload.channel).toBe(NOTIFICATION_CHANNEL_UNROUTED);

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        idempotencyKey: `notification.dispatch:${outboxes[0].id}`,
      },
    });
    expect(jobs).toHaveLength(1);
  });

  itWithDb('duplicate outbox idempotency key is rejected at database layer', async () => {
    const { visit, triage } = await seedVisitWithTriage('dup');

    await service.escalate(user(), visit.id, { reason: 'First escalation' });

    await expect(
      prisma.domainEventOutbox.create({
        data: {
          hospitalId,
          branchId,
          eventType: EMERGENCY_VISIT_ESCALATED_EVENT_TYPE,
          entityType: 'TriageRecord',
          entityId: triage.id,
          idempotencyKey: emergencyVisitEscalatedIdempotencyKey(triage.id),
          payload: { emergencyVisitId: visit.id },
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  itWithDb('notification dispatch retry does not duplicate notification rows', async () => {
    const { visit, triage } = await seedVisitWithTriage('retry');

    await service.escalate(user(), visit.id, { reason: 'Hypotension' });

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId,
        idempotencyKey: emergencyVisitEscalatedIdempotencyKey(triage.id),
      },
    });

    const job = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        idempotencyKey: `notification.dispatch:${outbox.id}`,
      },
    });

    const workerContext = { workerId: 'test-worker' };
    await dispatchHandler.handle(job, workerContext);
    await dispatchHandler.handle(job, workerContext);

    const notifications = await prisma.notification.findMany({
      where: {
        hospitalId,
        idempotencyKey: notificationIdempotencyKeyForOutbox(outbox.id),
      },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].channel).toBe(NOTIFICATION_CHANNEL_UNROUTED);
    expect(notifications[0].category).toBe(EMERGENCY_VISIT_ESCALATED_EVENT_TYPE);
    expect(notifications[0].status).toBe(NotificationStatus.PENDING);

    const outboxAfter = await prisma.domainEventOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
    expect(outboxAfter.status).toBe(DomainEventOutboxStatus.PROCESSED);
  });

  itWithDb('rolls back triage escalation when dispatch job enqueue fails', async () => {
    const { visit, triage } = await seedVisitWithTriage('rollback');

    const brokenJobService = new JobService(prisma as never);
    jest
      .spyOn(brokenJobService, 'enqueueWithClient')
      .mockRejectedValueOnce(new Error('simulated job enqueue failure'));

    const brokenOutbox = new DomainEventOutboxService(
      prisma as never,
      brokenJobService,
    );
    const failingService = new EmergencyService(
      prisma as never,
      new AuditService(prisma as never),
      brokenOutbox,
      { notifyEscalation: jest.fn().mockResolvedValue(0) } as never,
      { enqueueAfterCommit: jest.fn() } as never,
    );

    await expect(
      failingService.escalate(user(), visit.id, { reason: 'Should rollback' }),
    ).rejects.toThrow('simulated job enqueue failure');

    const triageRow = await prisma.triageRecord.findUniqueOrThrow({
      where: { id: triage.id },
    });
    expect(triageRow.escalatedAt).toBeNull();

    const outboxCount = await prisma.domainEventOutbox.count({
      where: {
        hospitalId,
        idempotencyKey: emergencyVisitEscalatedIdempotencyKey(triage.id),
      },
    });
    expect(outboxCount).toBe(0);

    jest.restoreAllMocks();
  });
});
