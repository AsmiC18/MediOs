import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalEncounterStatus,
  DiagnosticOrderPriority,
  DiagnosticOrderStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { DiagnosticsService } from './diagnostics.service';

describe('DiagnosticsService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const patientId = 'patient-1';
  const encounterId = 'encounter-1';

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
    diagnosticOrder: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    diagnosticOrderItem: { findUnique: jest.Mock; update: jest.Mock };
    clinicalEncounter: { findUnique: jest.Mock };
    patient: { findUnique: jest.Mock };
    branch: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: DiagnosticsService;

  const orderIncludeShape = {
    patient: {},
    encounter: { branchId: branchA },
    branch: {},
    orderedBy: {},
    items: [],
  };

  beforeEach(() => {
    prisma = {
      diagnosticOrder: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      diagnosticOrderItem: { findUnique: jest.fn(), update: jest.fn() },
      clinicalEncounter: { findUnique: jest.fn() },
      patient: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          diagnosticOrder: prisma.diagnosticOrder,
        }),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new DiagnosticsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      {
        createInTransaction: jest.fn(),
        enqueueDispatchInTransaction: jest.fn(),
      } as never,
      { enqueueInTransaction: jest.fn() } as never,
    );
  });

  describe('listOrders', () => {
    beforeEach(() => {
      prisma.diagnosticOrder.findMany.mockResolvedValue([]);
    });

    it('scopes branch user list to JWT branch and ignores query branchId', async () => {
      await service.listOrders(branchUser, { branchId: branchB });

      const where = prisma.diagnosticOrder.findMany.mock.calls[0][0].where;
      expect(where.hospitalId).toBe(hospitalId);
      expect(where.branchId).toBe(branchA);
    });

    it('preserves status filters under branch scope', async () => {
      await service.listOrders(branchUser, {
        status: DiagnosticOrderStatus.ORDERED,
      });

      const where = prisma.diagnosticOrder.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
      expect(where.status).toBe(DiagnosticOrderStatus.ORDERED);
    });

    it('allows hospital-wide user to filter by branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      await service.listOrders(hospitalWideUser, { branchId: branchB });

      const where = prisma.diagnosticOrder.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
    });

    it('allows hospital-wide user to list all branches', async () => {
      await service.listOrders(hospitalWideUser, {});

      const where = prisma.diagnosticOrder.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });
  });

  describe('getOrder', () => {
    it('allows branch user to get same-branch order', async () => {
      prisma.diagnosticOrder.findUnique.mockResolvedValue({
        id: 'order-a',
        hospitalId,
        branchId: branchA,
        orderNumber: 'LAB-000001',
        ...orderIncludeShape,
      });

      const order = await service.getOrder(branchUser, 'order-a');

      expect(order.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch order', async () => {
      prisma.diagnosticOrder.findUnique.mockResolvedValue({
        id: 'order-b',
        hospitalId,
        branchId: branchB,
        orderNumber: 'LAB-000002',
        ...orderIncludeShape,
        encounter: { branchId: branchB },
      });

      await expect(service.getOrder(branchUser, 'order-b')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital isolation', async () => {
      prisma.diagnosticOrder.findUnique.mockResolvedValue({
        id: 'order-other',
        hospitalId: otherHospitalId,
        branchId: branchA,
        orderNumber: 'LAB-000003',
        ...orderIncludeShape,
      });

      await expect(service.getOrder(branchUser, 'order-other')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createOrder', () => {
    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
        mergedIntoPatientId: null,
      });
      prisma.diagnosticOrder.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'order-new',
          ...data,
          status: DiagnosticOrderStatus.ORDERED,
          orderedAt: new Date(),
          ...orderIncludeShape,
          items: [],
        }),
      );
    });

    it('denies branch user creating order from another branch encounter', async () => {
      prisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: encounterId,
        hospitalId,
        patientId,
        branchId: branchB,
        status: ClinicalEncounterStatus.OPEN,
      });

      await expect(
        service.createOrder(branchUser, {
          encounterId,
          tests: [{ testCode: 'CBC', testName: 'CBC', specimenType: 'Blood' }],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.diagnosticOrder.create).not.toHaveBeenCalled();
    });

    it('creates order in JWT branch for branch-scoped user', async () => {
      prisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: encounterId,
        hospitalId,
        patientId,
        branchId: branchA,
        status: ClinicalEncounterStatus.OPEN,
      });

      const order = await service.createOrder(branchUser, {
        encounterId,
        priority: DiagnosticOrderPriority.NORMAL,
        tests: [{ testCode: 'CBC', testName: 'CBC', specimenType: 'Blood' }],
      });

      expect(order.branchId).toBe(branchA);
      expect(prisma.diagnosticOrder.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('preserves hospital-wide branch from encounter', async () => {
      prisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: encounterId,
        hospitalId,
        patientId,
        branchId: branchB,
        status: ClinicalEncounterStatus.OPEN,
      });

      const order = await service.createOrder(hospitalWideUser, {
        encounterId,
        tests: [{ testCode: 'CBC', testName: 'CBC', specimenType: 'Blood' }],
      });

      expect(order.branchId).toBe(branchB);
    });
  });

  describe('order mutations', () => {
    const baseOrder = {
      id: 'order-a',
      hospitalId,
      branchId: branchA,
      orderNumber: 'LAB-000010',
      status: DiagnosticOrderStatus.ORDERED,
      items: [],
      ...orderIncludeShape,
    };

    it('allows branch user to collect sample on same-branch order', async () => {
      prisma.diagnosticOrder.findUnique.mockResolvedValue(baseOrder);
      prisma.diagnosticOrder.update.mockResolvedValue({
        ...baseOrder,
        status: DiagnosticOrderStatus.SAMPLE_COLLECTED,
      });

      const updated = await service.collectSample(branchUser, 'order-a');

      expect(updated.status).toBe(DiagnosticOrderStatus.SAMPLE_COLLECTED);
    });

    it('denies branch user mutating another branch order', async () => {
      prisma.diagnosticOrder.findUnique.mockResolvedValue({
        ...baseOrder,
        id: 'order-b',
        branchId: branchB,
        encounter: { branchId: branchB },
      });

      await expect(
        service.collectSample(branchUser, 'order-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves invalid transition rules for same-branch user', async () => {
      prisma.diagnosticOrder.findUnique.mockResolvedValue({
        ...baseOrder,
        status: DiagnosticOrderStatus.COMPLETED,
      });

      await expect(
        service.collectSample(branchUser, 'order-a'),
      ).rejects.toThrow(BadRequestException);
    });

    it('denies branch user entering results on another branch item', async () => {
      prisma.diagnosticOrderItem.findUnique.mockResolvedValue({
        id: 'item-b',
        hospitalId,
        testCode: 'CBC',
        order: {
          ...baseOrder,
          id: 'order-b',
          branchId: branchB,
          status: DiagnosticOrderStatus.SAMPLE_COLLECTED,
          encounter: { branchId: branchB },
        },
      });

      await expect(
        service.enterResult(branchUser, 'item-b', { resultValue: '5.0' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPatientDiagnostics', () => {
    it('scopes patient diagnostics list for branch user', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
        mergedIntoPatientId: null,
      });
      prisma.diagnosticOrder.findMany.mockResolvedValue([]);

      await service.getPatientDiagnostics(branchUser, patientId);

      const where = prisma.diagnosticOrder.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
      expect(where.patientId).toBe(patientId);
    });
  });
});
