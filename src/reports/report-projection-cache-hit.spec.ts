import { ReportProjectionType } from '@prisma/client';
import { ReportProjectionService } from './report-projection.service';

describe('Report projection cache hit', () => {
  it('does not run compute when a fresh projection row exists', async () => {
    const prisma = {
      reportProjection: {
        findFirst: jest.fn().mockResolvedValue({
          payload: { cached: true },
          computedAt: new Date(),
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new ReportProjectionService(prisma as never);
    const compute = jest.fn();

    await service.getOrCompute(
      {
        hospitalId: 'h1',
        branchId: null,
        reportType: ReportProjectionType.GST_SUMMARY,
        periodFrom: new Date('2026-01-01'),
        periodTo: new Date('2026-02-01'),
      },
      60_000,
      compute,
    );

    expect(compute).not.toHaveBeenCalled();
    expect(prisma.reportProjection.create).not.toHaveBeenCalled();
  });
});
