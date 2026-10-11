import { ReportProjectionType } from '@prisma/client';
import { ReportProjectionRefreshJobHandler } from './report-projection-refresh.job-handler';
import { JOB_TYPES } from '../jobs/job-types.constants';

describe('ReportProjectionRefreshJobHandler', () => {
  it('invalidates projection row for refresh payload', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const materialize = jest.fn().mockResolvedValue(undefined);
    const handler = new ReportProjectionRefreshJobHandler(
      { reportProjection: { deleteMany } } as never,
      { materializeProjectionForRefreshJob: materialize } as never,
    );

    await handler.handle(
      {
        id: 'j1',
        type: JOB_TYPES.REPORT_PROJECTION_REFRESH,
        hospitalId: 'h1',
        payload: {
          reportType: ReportProjectionType.OPD_METRICS,
          periodFrom: '2026-01-01T00:00:00.000Z',
          periodTo: '2026-01-31T00:00:00.000Z',
          branchId: null,
        },
      } as never,
      { workerId: 'w1' },
    );

    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hospitalId: 'h1',
          reportType: ReportProjectionType.OPD_METRICS,
        }),
      }),
    );
    expect(materialize).toHaveBeenCalled();
  });
});
