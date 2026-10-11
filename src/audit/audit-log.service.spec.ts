import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditLogQueryService } from './audit-log.service';

describe('AuditLogQueryService', () => {
  const hospitalA = '11111111-1111-4111-8111-111111111111';
  const hospitalB = '99999999-9999-4999-8999-999999999999';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const branchUserA = {
    sub: 'user-branch-a',
    hospitalId: hospitalA,
    branchId: branchA,
  };

  const hospitalWideUserA = {
    sub: 'user-hospital-wide',
    hospitalId: hospitalA,
    branchId: null as string | null,
  };

  const hospitalWideUserB = {
    sub: 'user-hospital-b',
    hospitalId: hospitalB,
    branchId: null as string | null,
  };

  let prisma: {
    auditLog: { count: jest.Mock; findMany: jest.Mock };
    branch: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: AuditLogQueryService;

  const sampleRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'log-1',
    hospitalId: hospitalA,
    branchId: branchA,
    userId: 'actor-1',
    action: 'PATIENT_UPDATED',
    entity: 'Patient',
    entityId: 'patient-1',
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      auditLog: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      branch: { findUnique: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new AuditLogQueryService(prisma as never);
  });

  function lastWhere(): Record<string, unknown> {
    return prisma.auditLog.findMany.mock.calls.at(-1)?.[0]?.where;
  }

  describe('tenant isolation', () => {
    it('scopes every query to the user hospital', async () => {
      await service.list(hospitalWideUserA, {});
      expect(lastWhere()?.hospitalId).toBe(hospitalA);
    });

    it('never uses a client hospitalId query parameter (not on DTO)', async () => {
      await service.list(hospitalWideUserB, {});
      expect(lastWhere()?.hospitalId).toBe(hospitalB);
      expect(lastWhere()?.hospitalId).not.toBe(hospitalA);
    });

    it('Hospital B user query uses Hospital B in where only', async () => {
      await service.list(hospitalWideUserB, { action: 'X' });
      const where = lastWhere();
      expect(where?.hospitalId).toBe(hospitalB);
    });

    it('never widens tenant scope to another hospital via query', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        sampleRow({ hospitalId: hospitalA }),
      ]);

      await service.list(hospitalWideUserA, {});

      expect(lastWhere()?.hospitalId).toBe(hospitalA);
      expect(lastWhere()?.hospitalId).not.toBe(hospitalB);
    });
  });

  describe('branch isolation', () => {
    it('lists only own-branch rows for branch-scoped user', async () => {
      prisma.auditLog.count.mockResolvedValue(1);
      prisma.auditLog.findMany.mockResolvedValue([
        sampleRow({ branchId: branchA }),
      ]);

      const result = await service.list(branchUserA, {});

      expect(result.data[0].branchId).toBe(branchA);
      expect(lastWhere()?.branchId).toBe(branchA);
    });

    it('forces branch-scoped user to JWT branch regardless of query branchId', async () => {
      await service.list(branchUserA, { branchId: branchB });
      expect(lastWhere()?.branchId).toBe(branchA);
    });

    it('branch user cannot remove branch restriction via query', async () => {
      await service.list(branchUserA, {});
      expect(lastWhere()?.branchId).toBe(branchA);
    });

    it('branch-scoped user does not see branchId null rows (applyBranchScope)', async () => {
      await service.list(branchUserA, {});
      expect(lastWhere()?.branchId).toBe(branchA);
      expect(lastWhere()?.branchId).not.toBeNull();
    });

    it('hospital-wide user lists without branch filter by default', async () => {
      await service.list(hospitalWideUserA, {});
      expect(lastWhere()?.branchId).toBeUndefined();
    });

    it('hospital-wide user can query branch A via branchId filter', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: branchA,
        hospitalId: hospitalA,
      });

      await service.list(hospitalWideUserA, { branchId: branchA });

      expect(lastWhere()?.branchId).toBe(branchA);
    });

    it('hospital-wide user can query branch B via branchId filter', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: branchB,
        hospitalId: hospitalA,
      });

      await service.list(hospitalWideUserA, { branchId: branchB });

      expect(prisma.branch.findUnique).toHaveBeenCalledWith({
        where: { id: branchB },
      });
      expect(lastWhere()?.branchId).toBe(branchB);
    });

    it('rejects branchId from another hospital for hospital-wide user', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: branchB,
        hospitalId: hospitalB,
      });

      await expect(
        service.list(hospitalWideUserA, { branchId: branchB }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects unknown branchId for hospital-wide user', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.list(hospitalWideUserA, { branchId: branchB }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('filters (AND semantics)', () => {
    beforeEach(() => {
      prisma.auditLog.count.mockResolvedValue(1);
      prisma.auditLog.findMany.mockResolvedValue([sampleRow()]);
    });

    it('filters by action', async () => {
      await service.list(hospitalWideUserA, { action: 'PATIENT_UPDATED' });
      expect(lastWhere()?.action).toBe('PATIENT_UPDATED');
    });

    it('filters by entity', async () => {
      await service.list(hospitalWideUserA, { entity: 'Patient' });
      expect(lastWhere()?.entity).toBe('Patient');
    });

    it('filters by entityId', async () => {
      const entityId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      await service.list(hospitalWideUserA, { entityId });
      expect(lastWhere()?.entityId).toBe(entityId);
    });

    it('filters by userId', async () => {
      const userId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      await service.list(hospitalWideUserA, { userId });
      expect(lastWhere()?.userId).toBe(userId);
    });

    it('filters by from (inclusive gte)', async () => {
      const from = '2026-01-01T00:00:00.000Z';
      await service.list(hospitalWideUserA, { from });
      expect(lastWhere()?.createdAt).toEqual({
        gte: new Date(from),
      });
    });

    it('filters by to (exclusive lt)', async () => {
      const to = '2026-02-01T00:00:00.000Z';
      await service.list(hospitalWideUserA, { to });
      expect(lastWhere()?.createdAt).toEqual({
        lt: new Date(to),
      });
    });

    it('combines multiple filters with AND', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: branchA,
        hospitalId: hospitalA,
      });

      await service.list(hospitalWideUserA, {
        action: 'PATIENT_UPDATED',
        entity: 'Patient',
        branchId: branchA,
      });

      const where = lastWhere();
      expect(where?.hospitalId).toBe(hospitalA);
      expect(where?.action).toBe('PATIENT_UPDATED');
      expect(where?.entity).toBe('Patient');
      expect(where?.branchId).toBe(branchA);
    });
  });

  describe('pagination and ordering', () => {
    it('uses default page 1 and limit 50', async () => {
      await service.list(hospitalWideUserA, {});

      const args = prisma.auditLog.findMany.mock.calls[0][0];
      expect(args.skip).toBe(0);
      expect(args.take).toBe(50);

      const result = await service.list(hospitalWideUserA, {});
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(50);
    });

    it('respects page and limit', async () => {
      prisma.auditLog.count.mockResolvedValue(120);

      const result = await service.list(hospitalWideUserA, { page: 3, limit: 25 });

      const args = prisma.auditLog.findMany.mock.calls[0][0];
      expect(args.skip).toBe(50);
      expect(args.take).toBe(25);
      expect(result.meta.totalPages).toBe(5);
    });

    it('orders by createdAt desc then id desc', async () => {
      await service.list(hospitalWideUserA, {});

      expect(prisma.auditLog.findMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('returns correct total and totalPages', async () => {
      prisma.auditLog.count.mockResolvedValue(101);
      prisma.auditLog.findMany.mockResolvedValue([sampleRow()]);

      const result = await service.list(hospitalWideUserA, { limit: 50 });

      expect(result.meta.total).toBe(101);
      expect(result.meta.totalPages).toBe(3);
    });

    it('page beyond final page returns empty data with correct metadata', async () => {
      prisma.auditLog.count.mockResolvedValue(2);
      prisma.auditLog.findMany.mockResolvedValue([]);

      const result = await service.list(hospitalWideUserA, { page: 10, limit: 50 });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(10);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('response mapping', () => {
    it('does not expose metadata in list items', async () => {
      prisma.auditLog.count.mockResolvedValue(1);
      prisma.auditLog.findMany.mockResolvedValue([
        sampleRow({
          metadata: { password: 'secret', accessToken: 'tok' },
        }),
      ]);

      const result = await service.list(hospitalWideUserA, {});

      expect(result.data[0]).toEqual({
        id: 'log-1',
        hospitalId: hospitalA,
        branchId: branchA,
        actorUserId: 'actor-1',
        action: 'PATIENT_UPDATED',
        entity: 'Patient',
        entityId: 'patient-1',
        createdAt: new Date('2026-01-15T10:00:00.000Z'),
      });
      expect(result.data[0]).not.toHaveProperty('metadata');
    });

    it('selects only safe fields from prisma', async () => {
      await service.list(hospitalWideUserA, {});

      expect(prisma.auditLog.findMany.mock.calls[0][0].select).toEqual({
        id: true,
        hospitalId: true,
        branchId: true,
        userId: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
      });
    });
  });

  describe('fetchAllForExport (I2)', () => {
    it('does not paginate and uses full filtered set up to max rows', async () => {
      prisma.auditLog.count.mockResolvedValue(3);
      prisma.auditLog.findMany.mockResolvedValue([sampleRow()]);

      await service.fetchAllForExport(hospitalWideUserA, { action: 'X' }, 5000);

      const args = prisma.auditLog.findMany.mock.calls[0][0];
      expect(args.skip).toBeUndefined();
      expect(args.take).toBe(5000);
      expect(args.where.action).toBe('X');
    });

    it('skips findMany when total exceeds max rows', async () => {
      prisma.auditLog.count.mockResolvedValue(5001);

      const result = await service.fetchAllForExport(hospitalWideUserA, {}, 5000);

      expect(result.total).toBe(5001);
      expect(result.rows).toEqual([]);
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('applies branch scope for branch-scoped export user', async () => {
      prisma.auditLog.count.mockResolvedValue(0);
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.fetchAllForExport(branchUserA, { branchId: branchB }, 5000);

      expect(prisma.auditLog.count.mock.calls[0][0].where.branchId).toBe(branchA);
    });
  });
});
