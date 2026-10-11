import {
  AppointmentStatus,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { JobService } from '../../jobs/job.service';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { PatientEngagementAppointmentService } from '../../engagement/patient-engagement-appointment.service';
import { patientNpsJobIdempotencyKey } from '../../engagement/patient-nps-trigger-event.util';
import { APPOINTMENT_CANCELLED_EVENT_TYPE } from './appointment-cancelled-event.util';
import { AppointmentsService } from './appointments.service';
import { SchedulingPolicyService } from '../scheduling-policy.service';

describe('Appointment status state machine integration', () => {
  const prisma = new PrismaClient();
  const jobService = new JobService(prisma as never);
  const outboxService = new DomainEventOutboxService(prisma as never, jobService);
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const npsService = new PatientEngagementAppointmentService(jobService);

  let appointmentsService: AppointmentsService;
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const createdHospitalIds: string[] = [];
  const createdBranchIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdResourceIds: string[] = [];

  let hospitalId: string;
  let otherHospitalId: string;
  let branchId: string;
  let otherBranchId: string;
  let patientId: string;
  let resourceId: string;

  const hospitalUser = {
    sub: 'status-user',
    hospitalId: '',
    branchId: null as string | null,
  };

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    appointmentsService = new AppointmentsService(
      prisma as never,
      auditService as unknown as AuditService,
      outboxService,
      npsService,
      new SchedulingPolicyService(prisma as never),
    );

    const hospital = await prisma.hospital.create({
      data: { name: `Status SM ${runId}`, code: `STAT-${runId}` },
    });
    hospitalId = hospital.id;
    createdHospitalIds.push(hospitalId);
    hospitalUser.hospitalId = hospitalId;

    otherHospitalId = (
      await prisma.hospital.create({
        data: { name: `Other ${runId}`, code: `OTH-${runId}` },
      })
    ).id;
    createdHospitalIds.push(otherHospitalId);

    branchId = (
      await prisma.branch.create({
        data: { hospitalId, name: 'Main', code: `BR-${runId}` },
      })
    ).id;
    createdBranchIds.push(branchId);

    otherBranchId = (
      await prisma.branch.create({
        data: { hospitalId, name: 'Other', code: `BR2-${runId}` },
      })
    ).id;
    createdBranchIds.push(otherBranchId);

    patientId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          phone: `7${runId.replace(/\D/g, '').slice(0, 9)}`.slice(0, 15),
          firstName: 'Status',
        },
      })
    ).id;
    createdPatientIds.push(patientId);

    resourceId = (
      await prisma.resource.create({
        data: {
          hospitalId,
          branchId,
          type: ResourceType.DOCTOR,
          name: 'Dr Status',
          status: ResourceStatus.ACTIVE,
        },
      })
    ).id;
    createdResourceIds.push(resourceId);
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.job.deleteMany({
      where: { hospitalId: { in: createdHospitalIds } },
    });
    await prisma.domainEventOutbox.deleteMany({
      where: { hospitalId: { in: createdHospitalIds } },
    });
    await prisma.appointmentResource.deleteMany({
      where: { appointment: { hospitalId: { in: createdHospitalIds } } },
    });
    await prisma.appointment.deleteMany({
      where: { hospitalId: { in: createdHospitalIds } },
    });
    await prisma.resource.deleteMany({ where: { id: { in: createdResourceIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
    await prisma.hospital.deleteMany({ where: { id: { in: createdHospitalIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    auditService.log.mockClear();
  });

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  let slotIndex = 0;

  async function createScheduled() {
    slotIndex += 1;
    const day = String(10 + (slotIndex % 15)).padStart(2, '0');
    const startAt = `2028-01-${day}T09:00:00.000Z`;
    const endAt = `2028-01-${day}T09:30:00.000Z`;
    return appointmentsService.create(hospitalUser, {
      patientId,
      branchId,
      resourceIds: [resourceId],
      startAt,
      endAt,
    });
  }

  async function setStatusDirectly(
    appointmentId: string,
    status: AppointmentStatus,
  ) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status },
    });
  }

  itDb('SCHEDULED -> COMPLETED succeeds', async () => {
    const appt = await createScheduled();
    const updated = await appointmentsService.update(hospitalUser, appt.id, {
      status: AppointmentStatus.COMPLETED,
    });
    expect(updated.status).toBe(AppointmentStatus.COMPLETED);
  });

  itDb('SCHEDULED -> CANCELLED succeeds through cancel path', async () => {
    const appt = await createScheduled();
    const cancelled = await appointmentsService.cancel(hospitalUser, appt.id);
    expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);
  });

  itDb('SCHEDULED -> NO_SHOW succeeds', async () => {
    const appt = await createScheduled();
    const updated = await appointmentsService.update(hospitalUser, appt.id, {
      status: AppointmentStatus.NO_SHOW,
    });
    expect(updated.status).toBe(AppointmentStatus.NO_SHOW);
  });

  const terminalCases: Array<{
    from: AppointmentStatus;
    to: AppointmentStatus;
  }> = [
    { from: AppointmentStatus.COMPLETED, to: AppointmentStatus.SCHEDULED },
    { from: AppointmentStatus.COMPLETED, to: AppointmentStatus.CANCELLED },
    { from: AppointmentStatus.COMPLETED, to: AppointmentStatus.NO_SHOW },
    { from: AppointmentStatus.CANCELLED, to: AppointmentStatus.SCHEDULED },
    { from: AppointmentStatus.CANCELLED, to: AppointmentStatus.COMPLETED },
    { from: AppointmentStatus.CANCELLED, to: AppointmentStatus.NO_SHOW },
    { from: AppointmentStatus.NO_SHOW, to: AppointmentStatus.SCHEDULED },
    { from: AppointmentStatus.NO_SHOW, to: AppointmentStatus.COMPLETED },
    { from: AppointmentStatus.NO_SHOW, to: AppointmentStatus.CANCELLED },
  ];

  for (const { from, to } of terminalCases) {
    itDb(`rejects ${from} -> ${to}`, async () => {
      const appt = await createScheduled();
      await setStatusDirectly(appt.id, from);
      await expect(
        appointmentsService.update(hospitalUser, appt.id, { status: to }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  }

  itDb('rejects PATCH to CANCELLED in favor of cancel endpoint', async () => {
    const appt = await createScheduled();
    await expect(
      appointmentsService.update(hospitalUser, appt.id, {
        status: AppointmentStatus.CANCELLED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  itDb('rejects rescheduling terminal appointments', async () => {
    const appt = await createScheduled();
    await setStatusDirectly(appt.id, AppointmentStatus.COMPLETED);
    await expect(
      appointmentsService.update(hospitalUser, appt.id, {
        startAt: '2028-01-11T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  itDb('concurrent complete vs cancel yields one terminal state and one cancellation outbox at most', async () => {
    const appt = await createScheduled();
    const results = await Promise.allSettled([
      appointmentsService.update(hospitalUser, appt.id, {
        status: AppointmentStatus.COMPLETED,
      }),
      appointmentsService.cancel(hospitalUser, appt.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: appt.id },
    });
    expect([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED]).toContain(
      row.status,
    );

    const cancelOutboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId,
        entityId: appt.id,
        eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
      },
    });
    expect(cancelOutboxes.length).toBeLessThanOrEqual(1);
    if (row.status === AppointmentStatus.CANCELLED) {
      expect(cancelOutboxes).toHaveLength(1);
    }
  });

  itDb('NPS trigger remains idempotent for repeated COMPLETED updates', async () => {
    const appt = await createScheduled();
    await appointmentsService.update(hospitalUser, appt.id, {
      status: AppointmentStatus.COMPLETED,
    });
    await appointmentsService.update(hospitalUser, appt.id, {
      notes: 'Already completed',
    });

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId,
        type: JOB_TYPES.PATIENT_NPS_TRIGGER,
        idempotencyKey: patientNpsJobIdempotencyKey(appt.id),
      },
    });
    expect(jobs).toHaveLength(1);
  });

  itDb('cancellation event remains idempotent on repeated cancel', async () => {
    const appt = await createScheduled();
    await appointmentsService.cancel(hospitalUser, appt.id);
    await appointmentsService.cancel(hospitalUser, appt.id);

    const cancelOutboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId,
        entityId: appt.id,
        eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
      },
    });
    expect(cancelOutboxes).toHaveLength(1);
  });

  itDb('cancel rejects terminal COMPLETED appointments', async () => {
    const appt = await createScheduled();
    await appointmentsService.update(hospitalUser, appt.id, {
      status: AppointmentStatus.COMPLETED,
    });
    await expect(
      appointmentsService.cancel(hospitalUser, appt.id),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  itDb('hospital isolation still applies', async () => {
    const appt = await createScheduled();
    const otherUser = {
      sub: 'other',
      hospitalId: otherHospitalId,
      branchId: null,
    };
    await expect(
      appointmentsService.findOne(otherUser, appt.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itDb('branch isolation still applies for branch-scoped staff', async () => {
    const appt = await createScheduled();
    const branchUser = {
      sub: 'branch-user',
      hospitalId,
      branchId: otherBranchId,
    };
    await expect(
      appointmentsService.findOne(branchUser, appt.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
