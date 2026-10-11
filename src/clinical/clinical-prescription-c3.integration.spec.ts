import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  JobStatus,
  PrescriptionStatus,
  PrismaClient,
} from '@prisma/client';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { instantiateNotificationDispatchJobHandler } from '../notifications/notification-dispatch.handler.test-util';
import { NotificationPolicyService } from '../notifications/notification-policy.service';
import { NotificationService } from '../notifications/notification.service';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';
import { UnavailableDrugInteractionAdapter } from './adapters/unavailable-drug-interaction.adapter';
import { AuditService } from '../audit/audit.service';
import { ClinicalService } from './clinical.service';
import { Icd10Service } from './icd10/icd10.service';
import { ClinicalDrugService } from './drugs/clinical-drug.service';
import {
  CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
  CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE,
} from './events/clinical-prescription-event.util';
import { ClinicalPrescriptionOutboxService } from './events/clinical-prescription-outbox.service';
import { ClinicalSafetyPolicyService } from './safety/clinical-safety-policy.service';
import { PrescriptionSafetyService } from './safety/prescription-safety.service';
import { PharmacyPrescriptionProcessJobHandler } from '../pharmacy/jobs/pharmacy-prescription-process.job-handler';
import { PharmacyPrescriptionProcessService } from '../pharmacy/jobs/pharmacy-prescription-process.service';

describe('Clinical prescription C3.1 integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let roleId: string;
  let userId: string;
  let patientId: string;
  let encounterId: string;

  let clinicalService: ClinicalService;
  let pharmacyProcessService: PharmacyPrescriptionProcessService;
  let domainEventOutboxService: DomainEventOutboxService;

  const user = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
    roleId,
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const auditService = new AuditService(prisma as never);
    const jobService = new JobService(prisma as never);
    domainEventOutboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    const clinicalPrescriptionOutboxService = new ClinicalPrescriptionOutboxService(
      domainEventOutboxService,
    );
    const clinicalDrugService = new ClinicalDrugService(prisma as never);
    const policyService = new ClinicalSafetyPolicyService(prisma as never);
    const prescriptionSafetyService = new PrescriptionSafetyService(
      prisma as never,
      clinicalDrugService,
      policyService,
      new UnavailableDrugInteractionAdapter(),
    );
    clinicalService = new ClinicalService(
      prisma as never,
      auditService,
      prescriptionSafetyService,
      clinicalPrescriptionOutboxService,
      new Icd10Service(prisma as never),
    );
    pharmacyProcessService = new PharmacyPrescriptionProcessService(
      prisma as never,
      domainEventOutboxService,
    );

    const hospital = await prisma.hospital.create({
      data: { name: `C3 ${runId}`, code: `C3-${runId}` },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Role-${runId}` },
    });
    roleId = role.id;

    for (const name of ['clinical:manage', 'clinical:read']) {
      const permission = await prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name, description: name },
      });
      await prisma.rolePermission.create({
        data: { roleId, permissionId: permission.id },
      });
    }

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId,
        name: 'Clinician',
        email: `c3-${runId}@example.com`,
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
        phone: `7${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;

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
    encounterId = encounter.id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  it('persists prescription with outbox and jobs in one transaction', async () => {
    if (!dbAvailable) {
      return;
    }

    const rx = await clinicalService.createPrescription(user(), encounterId, {
      items: [{ medicationName: 'Paracetamol', quantity: 10 }],
    });

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId,
        eventType: CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
        entityId: rx.id,
      },
    });

    const notifJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        idempotencyKey: `notification.dispatch:${outbox.id}`,
      },
    });

    const pharmacyJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId,
        type: JOB_TYPES.PHARMACY_PRESCRIPTION_PROCESS,
        idempotencyKey: `${JOB_TYPES.PHARMACY_PRESCRIPTION_PROCESS}:${outbox.id}`,
      },
    });

    expect(notifJob.status).toBe(JobStatus.PENDING);
    expect(pharmacyJob.status).toBe(JobStatus.PENDING);
  });

  it('rolls back prescription when outbox insert fails', async () => {
    if (!dbAvailable) {
      return;
    }

    const before = await prisma.prescription.count({ where: { hospitalId } });
    const spy = jest
      .spyOn(domainEventOutboxService, 'createInTransaction')
      .mockRejectedValueOnce(new Error('outbox down'));

    await expect(
      clinicalService.createPrescription(user(), encounterId, {
        items: [{ medicationName: 'Ibuprofen', quantity: 5 }],
      }),
    ).rejects.toThrow('outbox down');

    spy.mockRestore();
    const after = await prisma.prescription.count({ where: { hospitalId } });
    expect(after).toBe(before);
  });

  it('emits status_changed once and skips duplicate status submission', async () => {
    if (!dbAvailable) {
      return;
    }

    const rx = await clinicalService.createPrescription(user(), encounterId, {
      items: [{ medicationName: 'Vitamin C', quantity: 30 }],
    });

    await clinicalService.updatePrescriptionStatus(user(), rx.id, {
      status: PrescriptionStatus.COMPLETED,
    });

    const events = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId,
        entityId: rx.id,
        eventType: CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE,
      },
    });
    expect(events).toHaveLength(1);

    await clinicalService.updatePrescriptionStatus(user(), rx.id, {
      status: PrescriptionStatus.COMPLETED,
    });

    const eventsAfter = await prisma.domainEventOutbox.count({
      where: {
        hospitalId,
        entityId: rx.id,
        eventType: CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE,
      },
    });
    expect(eventsAfter).toBe(1);
  });

  it('creates one pharmacy work item and survives handler retry', async () => {
    if (!dbAvailable) {
      return;
    }

    const rx = await clinicalService.createPrescription(user(), encounterId, {
      items: [{ medicationName: 'Cetirizine', quantity: 10 }],
    });

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId,
        eventType: CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
        entityId: rx.id,
      },
    });

    const handler = new PharmacyPrescriptionProcessJobHandler(
      pharmacyProcessService,
    );

    await handler.handle(
      {
        id: 'job-1',
        hospitalId,
        branchId,
        type: JOB_TYPES.PHARMACY_PRESCRIPTION_PROCESS,
        payload: { outboxId: outbox.id },
      } as never,
      { workerId: 'worker-1' },
    );

    await handler.handle(
      {
        id: 'job-2',
        hospitalId,
        branchId,
        type: JOB_TYPES.PHARMACY_PRESCRIPTION_PROCESS,
        payload: { outboxId: outbox.id },
      } as never,
      { workerId: 'worker-1' },
    );

    const workItems = await prisma.pharmacyPrescriptionWorkItem.findMany({
      where: { hospitalId, prescriptionId: rx.id },
    });
    expect(workItems).toHaveLength(1);

    const dispensingCount = await prisma.pharmacyDispensing.count({
      where: { hospitalId, prescriptionId: rx.id },
    });
    expect(dispensingCount).toBe(0);
  });

  it('rejects cross-tenant pharmacy processing', async () => {
    if (!dbAvailable) {
      return;
    }

    const otherHospital = await prisma.hospital.create({
      data: { name: `Other ${runId}`, code: `OTH-C3-${runId}` },
    });

    const rx = await clinicalService.createPrescription(user(), encounterId, {
      items: [{ medicationName: 'Amlodipine', quantity: 10 }],
    });

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId,
        eventType: CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
        entityId: rx.id,
      },
    });

    await expect(
      pharmacyProcessService.processOutboxEvent(otherHospital.id, outbox.id),
    ).rejects.toBeInstanceOf(JobPermanentFailureError);
  });

  it('creates notification with explicit clinical category and preference gate', async () => {
    if (!dbAvailable) {
      return;
    }

    const rx = await clinicalService.createPrescription(user(), encounterId, {
      items: [{ medicationName: 'Metformin', quantity: 30 }],
    });

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId,
        eventType: CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
        entityId: rx.id,
      },
    });

    const notificationService = new NotificationService(prisma as never);
    const preferenceService = new PatientNotificationPreferenceService(
      prisma as never,
    );
    const policyService = new NotificationPolicyService(
      prisma as never,
      preferenceService,
    );
    const dispatchHandler = instantiateNotificationDispatchJobHandler({
      prisma,
      outboxService: domainEventOutboxService,
      notificationService,
      policyService,
    });

    await dispatchHandler.handle(
      {
        id: 'dispatch-1',
        hospitalId,
        branchId,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        payload: { outboxId: outbox.id },
      } as never,
      { workerId: 'worker-1' },
    );

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId, outboxId: outbox.id },
    });
    expect(notification.category).toBe(CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE);
  });
});
