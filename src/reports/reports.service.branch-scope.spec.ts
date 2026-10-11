import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { createPassThroughReportProjectionService } from './report-projection.test-util';
import { ReportsService } from './reports.service';

describe('ReportsService branch scope', () => {
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

  const filters = {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-15T00:00:00.000Z',
  };

  let prisma: {
    $transaction: jest.Mock;
    invoice: { aggregate: jest.Mock };
    payment: { aggregate: jest.Mock };
    refund: { aggregate: jest.Mock };
    invoiceItem: { groupBy: jest.Mock };
    branch: { findUnique: jest.Mock };
  };
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockImplementation(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
      invoice: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _sum: { totalAmount: new Prisma.Decimal(0) },
        }),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0) },
        }),
      },
      refund: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0) },
        }),
      },
      invoiceItem: { groupBy: jest.fn().mockResolvedValue([]) },
      branch: { findUnique: jest.fn() },
    };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      createPassThroughReportProjectionService(),
    );
  });

  it('forces branch-scoped JWT users to their branch', async () => {
    await service.getFinancialSummary(branchUser, filters);

    const invoiceWhere = prisma.invoice.aggregate.mock.calls[0][0].where;
    expect(invoiceWhere.branchId).toBe(branchA);
  });

  it('rejects branch-scoped user requesting another branch', async () => {
    await expect(
      service.getFinancialSummary(branchUser, {
        ...filters,
        branchId: branchB,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows hospital-wide user to narrow to a valid branch', async () => {
    prisma.branch.findUnique.mockResolvedValue({
      id: branchB,
      hospitalId,
    });

    await service.getFinancialSummary(hospitalWideUser, {
      ...filters,
      branchId: branchB,
    });

    const invoiceWhere = prisma.invoice.aggregate.mock.calls[0][0].where;
    expect(invoiceWhere.branchId).toBe(branchB);
  });

  it('rejects foreign hospital branch for hospital-wide user', async () => {
    prisma.branch.findUnique.mockResolvedValue({
      id: branchB,
      hospitalId: otherHospitalId,
    });

    await expect(
      service.getFinancialSummary(hospitalWideUser, {
        ...filters,
        branchId: branchB,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects unknown branch id', async () => {
    prisma.branch.findUnique.mockResolvedValue(null);

    await expect(
      service.getFinancialSummary(hospitalWideUser, {
        ...filters,
        branchId: branchB,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
