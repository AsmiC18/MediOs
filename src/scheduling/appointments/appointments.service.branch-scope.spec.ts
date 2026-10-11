import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, ResourceStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { AppointmentsService } from './appointments.service';
import { SchedulingPolicyService } from '../scheduling-policy.service';

describe('AppointmentsService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const resourceId = 'resource-1';
  const patientId = 'patient-1';

  const branchUser = {
    sub: 'user-branch-a',
    hospitalId,
    branchId: branchA,
  };

  const hospitalWideUser = {
    sub: 'user-hospital-wide',
    hospitalId,
    branchId: null as string | null,
  };

  const startAt = '2026-12-01T10:00:00.000Z';
  const endAt = '2026-12-01T10:30:00.000Z';

  let prisma: {
    appointment: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    appointmentResource: { createMany: jest.Mock; deleteMany: jest.Mock };
    patient: { findUnique: jest.Mock };
    branch: { findUnique: jest.Mock };
    resource: { findMany: jest.Mock };
    hospital: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let domainEventOutboxService: {
    createInTransaction: jest.Mock;
    enqueueDispatchInTransaction: jest.Mock;
  };
  let service: AppointmentsService;

  beforeEach(() => {
    prisma = {
      appointment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      appointmentResource: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      patient: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      resource: { findMany: jest.fn() },
      hospital: { findUnique: jest.fn().mockResolvedValue({ defaultBookingRule: null }) },
      $transaction: jest.fn(async (callback) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          appointment: prisma.appointment,
          appointmentResource: prisma.appointmentResource,
          branch: prisma.branch,
          hospital: prisma.hospital,
          bookingRule: { findUnique: jest.fn() },
        }),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    domainEventOutboxService = {
      createInTransaction: jest
        .fn()
        .mockResolvedValue({ id: 'outbox-mock' }),
      enqueueDispatchInTransaction: jest.fn().mockResolvedValue({ id: 'job-mock' }),
    };
    service = new AppointmentsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      domainEventOutboxService as unknown as DomainEventOutboxService,
      { enqueueNpsTriggerIfNewlyCompleted: jest.fn().mockResolvedValue(undefined) } as never,
      {
        assertAppointmentBookingAllowed: jest.fn().mockResolvedValue(undefined),
        hasResourceSchedulingConflict: jest.fn().mockResolvedValue(false),
      } as unknown as SchedulingPolicyService,
    );
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.appointment.findMany.mockResolvedValue([]);
    });

    it('scopes branch user list to JWT branch and ignores query branchId', async () => {
      await service.findAll(branchUser, { branchId: branchB });

      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.hospitalId).toBe(hospitalId);
      expect(where.branchId).toBe(branchA);
    });

    it('preserves status and date filters under branch scope', async () => {
      await service.findAll(branchUser, {
        status: AppointmentStatus.SCHEDULED,
        startAt,
        endAt,
      });

      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
      expect(where.status).toBe(AppointmentStatus.SCHEDULED);
      expect(where.startAt).toEqual({ gte: new Date(startAt) });
      expect(where.endAt).toEqual({ lte: new Date(endAt) });
    });

    it('allows hospital-wide user to filter by branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      await service.findAll(hospitalWideUser, { branchId: branchB });

      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
    });

    it('allows hospital-wide user to list all branches', async () => {
      await service.findAll(hospitalWideUser, {});

      const where = prisma.appointment.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });
  });

  describe('findOne', () => {
    const appointmentInclude = {
      patient: {},
      resources: { include: { resource: true } },
    };

    it('allows branch user to get same-branch appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-a',
        hospitalId,
        branchId: branchA,
        resources: [],
      });

      const appointment = await service.findOne(branchUser, 'appt-a');

      expect(appointment.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-b',
        hospitalId,
        branchId: branchB,
        resources: [],
      });

      await expect(service.findOne(branchUser, 'appt-b')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital isolation', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-other',
        hospitalId: otherHospitalId,
        branchId: branchA,
        resources: [],
      });

      await expect(service.findOne(branchUser, 'appt-other')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
      });
      prisma.branch.findUnique.mockResolvedValue({ id: branchA, hospitalId });
      prisma.resource.findMany.mockResolvedValue([
        {
          id: resourceId,
          hospitalId,
          branchId: branchA,
          status: ResourceStatus.ACTIVE,
          name: 'Dr A',
        },
      ]);
      prisma.appointment.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'appt-new',
          startAt: new Date(startAt),
          endAt: new Date(endAt),
          ...data,
        }),
      );
      prisma.appointment.findUniqueOrThrow.mockImplementation(({ where }) =>
        Promise.resolve({
          id: where.id,
          hospitalId,
          branchId: branchA,
          patientId,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
          resources: [],
        }),
      );
    });

    it('forces branch user create into JWT branch', async () => {
      await service.create(branchUser, {
        patientId,
        branchId: branchB,
        resourceIds: [resourceId],
        startAt,
        endAt,
      });

      expect(prisma.appointment.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
      expect(prisma.resource.findMany).toHaveBeenCalled();
    });

    it('rejects incompatible resources for resolved branch', async () => {
      prisma.resource.findMany.mockResolvedValue([
        {
          id: resourceId,
          hospitalId,
          branchId: branchB,
          status: ResourceStatus.ACTIVE,
          name: 'Dr B',
        },
      ]);

      await expect(
        service.create(branchUser, {
          patientId,
          resourceIds: [resourceId],
          startAt,
          endAt,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('preserves hospital-wide branch selection', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });
      prisma.resource.findMany.mockResolvedValue([
        {
          id: resourceId,
          hospitalId,
          branchId: branchB,
          status: ResourceStatus.ACTIVE,
          name: 'Dr B',
        },
      ]);
      prisma.appointment.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'appt-new',
          startAt: new Date(startAt),
          endAt: new Date(endAt),
          ...data,
        }),
      );
      prisma.appointment.findUniqueOrThrow.mockImplementation(({ where }) =>
        Promise.resolve({
          id: where.id,
          hospitalId,
          branchId: branchB,
          patientId,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
          resources: [],
        }),
      );

      await service.create(hospitalWideUser, {
        patientId,
        branchId: branchB,
        resourceIds: [resourceId],
        startAt,
        endAt,
      });

      expect(prisma.appointment.create.mock.calls[0][0].data.branchId).toBe(
        branchB,
      );
    });
  });

  describe('update and cancel', () => {
    const existingAppointment = {
      id: 'appt-a',
      hospitalId,
      branchId: branchA,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      status: AppointmentStatus.SCHEDULED,
      resources: [{ resourceId, resource: { id: resourceId, branchId: branchA } }],
    };

    it('denies branch user updating another branch appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...existingAppointment,
        id: 'appt-b',
        branchId: branchB,
      });

      await expect(
        service.update(branchUser, 'appt-b', { notes: 'nope' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user moving appointment to another branch', async () => {
      prisma.appointment.findUnique.mockResolvedValue(existingAppointment);

      await expect(
        service.update(branchUser, 'appt-a', { branchId: branchB }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user cancelling another branch appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...existingAppointment,
        id: 'appt-b',
        branchId: branchB,
      });

      await expect(service.cancel(branchUser, 'appt-b')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows hospital-wide user to change branch with validation', async () => {
      prisma.appointment.findUnique.mockResolvedValue(existingAppointment);
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });
      prisma.resource.findMany.mockResolvedValue([
        {
          id: resourceId,
          hospitalId,
          branchId: branchB,
          status: ResourceStatus.ACTIVE,
          name: 'Dr B',
        },
      ]);
      prisma.appointment.findFirst.mockResolvedValue(null);
      prisma.appointment.update.mockResolvedValue({
        ...existingAppointment,
        branchId: branchB,
        resources: existingAppointment.resources,
      });
      prisma.appointment.findUniqueOrThrow.mockResolvedValue({
        ...existingAppointment,
        branchId: branchB,
        resources: existingAppointment.resources,
      });

      const updated = await service.update(hospitalWideUser, 'appt-a', {
        branchId: branchB,
      });

      expect(updated.branchId).toBe(branchB);
      expect(prisma.branch.findUnique).toHaveBeenCalled();
    });
  });
});
