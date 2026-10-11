import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  OpdQueuePriority,
  OpdQueueStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { OpdQueueService } from './opd-queue.service';

describe('OpdQueueService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';

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

  let prisma: {
    opdQueueEntry: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    appointment: { findUnique: jest.Mock; updateMany: jest.Mock };
    branch: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: OpdQueueService;

  const queueEntryIncludeShape = {
    patient: expect.anything(),
    appointment: expect.anything(),
  };

  beforeEach(() => {
    prisma = {
      opdQueueEntry: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      appointment: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      branch: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          opdQueueEntry: prisma.opdQueueEntry,
          appointment: prisma.appointment,
        }),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new OpdQueueService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      { enqueueAfterCommit: jest.fn() } as never,
    );
  });

  describe('listQueue', () => {
    beforeEach(() => {
      prisma.opdQueueEntry.findMany.mockResolvedValue([]);
    });

    it('scopes branch user list to JWT branch and ignores query branchId', async () => {
      await service.listQueue(branchUser, { branchId: branchB });

      const where = prisma.opdQueueEntry.findMany.mock.calls[0][0].where;
      expect(where.hospitalId).toBe(hospitalId);
      expect(where.branchId).toBe(branchA);
    });

    it('preserves status filters under branch scope', async () => {
      await service.listQueue(branchUser, { status: OpdQueueStatus.WAITING });

      const where = prisma.opdQueueEntry.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
      expect(where.status).toBe(OpdQueueStatus.WAITING);
    });

    it('allows hospital-wide user to filter by branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      await service.listQueue(hospitalWideUser, { branchId: branchB });

      const where = prisma.opdQueueEntry.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
    });

    it('allows hospital-wide user to list all branches', async () => {
      await service.listQueue(hospitalWideUser, {});

      const where = prisma.opdQueueEntry.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });
  });

  describe('getQueueEntry', () => {
    it('allows branch user to get same-branch entry', async () => {
      prisma.opdQueueEntry.findUnique.mockResolvedValue({
        id: 'q-a',
        hospitalId,
        branchId: branchA,
        status: OpdQueueStatus.WAITING,
        ...queueEntryIncludeShape,
      });

      const entry = await service.getQueueEntry(branchUser, 'q-a');

      expect(entry.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch entry', async () => {
      prisma.opdQueueEntry.findUnique.mockResolvedValue({
        id: 'q-b',
        hospitalId,
        branchId: branchB,
        status: OpdQueueStatus.WAITING,
        ...queueEntryIncludeShape,
      });

      await expect(service.getQueueEntry(branchUser, 'q-b')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital isolation', async () => {
      prisma.opdQueueEntry.findUnique.mockResolvedValue({
        id: 'q-other',
        hospitalId: otherHospitalId,
        branchId: branchA,
        status: OpdQueueStatus.WAITING,
        ...queueEntryIncludeShape,
      });

      await expect(
        service.getQueueEntry(branchUser, 'q-other'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkIn (create)', () => {
    const appointmentId = 'appointment-1';
    const startAt = new Date('2026-12-01T10:00:00.000Z');

    beforeEach(() => {
      prisma.opdQueueEntry.findFirst.mockResolvedValue(null);
      prisma.opdQueueEntry.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'queue-new',
          ...data,
          patient: {},
          appointment: {},
        }),
      );
    });

    it('forces queue entry branch to JWT branch for branch-scoped user', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: appointmentId,
        hospitalId,
        branchId: branchA,
        patientId: 'patient-1',
        status: AppointmentStatus.SCHEDULED,
        startAt,
      });

      const entry = await service.checkIn(branchUser, { appointmentId });

      expect(entry.branchId).toBe(branchA);
      expect(prisma.opdQueueEntry.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('denies check-in when appointment is on another branch', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: appointmentId,
        hospitalId,
        branchId: branchB,
        patientId: 'patient-1',
        status: AppointmentStatus.SCHEDULED,
        startAt,
      });

      await expect(
        service.checkIn(branchUser, { appointmentId }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.opdQueueEntry.create).not.toHaveBeenCalled();
    });

    it('preserves hospital-wide check-in branch from appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: appointmentId,
        hospitalId,
        branchId: branchB,
        patientId: 'patient-1',
        status: AppointmentStatus.SCHEDULED,
        startAt,
      });

      const entry = await service.checkIn(hospitalWideUser, { appointmentId });

      expect(entry.branchId).toBe(branchB);
    });
  });

  describe('transitions and priority', () => {
    const baseEntry = {
      id: 'q-a',
      hospitalId,
      branchId: branchA,
      appointmentId: 'appointment-1',
      patientId: 'patient-1',
      tokenNumber: 1,
      priority: OpdQueuePriority.NORMAL,
      patient: {},
      appointment: {},
    };

    it('denies branch user transitioning another branch entry', async () => {
      prisma.opdQueueEntry.findUnique.mockResolvedValue({
        ...baseEntry,
        id: 'q-b',
        branchId: branchB,
        status: OpdQueueStatus.WAITING,
      });

      await expect(service.callPatient(branchUser, 'q-b')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('preserves invalid transition rules for same-branch user', async () => {
      prisma.opdQueueEntry.findUnique.mockResolvedValue({
        ...baseEntry,
        status: OpdQueueStatus.WAITING,
      });

      await expect(
        service.completeConsultation(branchUser, 'q-a'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows branch user to call same-branch entry', async () => {
      prisma.opdQueueEntry.findUnique.mockResolvedValue({
        ...baseEntry,
        status: OpdQueueStatus.WAITING,
      });
      prisma.opdQueueEntry.update.mockResolvedValue({
        ...baseEntry,
        status: OpdQueueStatus.CALLED,
        calledAt: new Date(),
      });

      const updated = await service.callPatient(branchUser, 'q-a');

      expect(updated.status).toBe(OpdQueueStatus.CALLED);
    });

    it('allows hospital-wide user to update priority on any branch entry', async () => {
      prisma.opdQueueEntry.findUnique.mockResolvedValue({
        ...baseEntry,
        branchId: branchB,
        status: OpdQueueStatus.WAITING,
      });
      prisma.opdQueueEntry.update.mockResolvedValue({
        ...baseEntry,
        branchId: branchB,
        status: OpdQueueStatus.WAITING,
        priority: OpdQueuePriority.HIGH,
      });

      const updated = await service.updatePriority(hospitalWideUser, 'q-a', {
        priority: OpdQueuePriority.HIGH,
      });

      expect(updated.priority).toBe(OpdQueuePriority.HIGH);
    });
  });
});
