import { ReportProjectionType } from '@prisma/client';
import { ReportProjectionService } from './report-projection.service';

describe('ReportProjectionService', () => {
  it('computes and stores projection when cache miss', async () => {
    const rows: Array<Record<string, unknown>> = [];
    const prisma = {
      reportProjection: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          rows.push(data);
          return { id: 'p1', ...data, computedAt: new Date() };
        }),
        update: jest.fn(),
      },
    };
    const service = new ReportProjectionService(prisma as never);
    const key = {
      hospitalId: 'h1',
      branchId: null,
      reportType: ReportProjectionType.OPD_METRICS,
      periodFrom: new Date('2026-01-01'),
      periodTo: new Date('2026-01-31'),
    };
    const compute = jest.fn().mockResolvedValue({ visits: 3 });

    const result = await service.getOrCompute(key, 60_000, compute);

    expect(result).toEqual({ visits: 3 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(prisma.reportProjection.create).toHaveBeenCalled();
  });

  it('returns cached payload when fresh', async () => {
    const prisma = {
      reportProjection: {
        findFirst: jest.fn().mockResolvedValue({
          payload: { visits: 9 },
          computedAt: new Date(),
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new ReportProjectionService(prisma as never);
    const compute = jest.fn();

    const result = await service.getOrCompute(
      {
        hospitalId: 'h1',
        branchId: 'b1',
        reportType: ReportProjectionType.GST_SUMMARY,
        periodFrom: new Date('2026-01-01'),
        periodTo: new Date('2026-01-31'),
      },
      60_000,
      compute,
    );

    expect(result).toEqual({ visits: 9 });
    expect(compute).not.toHaveBeenCalled();
  });
});
