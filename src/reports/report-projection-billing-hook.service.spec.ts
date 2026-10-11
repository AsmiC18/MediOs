import { ReportProjectionType } from '@prisma/client';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { ReportProjectionBillingHookService } from './report-projection-billing-hook.service';
import { BILLING_AFFECTED_REPORT_PROJECTION_TYPES } from './report-projection-invalidation.util';

describe('ReportProjectionBillingHookService', () => {
  it('invalidates projections and enqueues refresh jobs idempotently per report type', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const enqueue = jest.fn().mockResolvedValue({ id: 'job-1' });
    const service = new ReportProjectionBillingHookService(
      { reportProjection: { deleteMany } } as never,
      { enqueue } as never,
    );

    const referenceAt = new Date('2026-10-15T12:00:00.000Z');
    await service.onBillingReportAffectingMutation({
      hospitalId: 'h1',
      branchId: 'b1',
      referenceAt,
    });

    expect(deleteMany).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(
      BILLING_AFFECTED_REPORT_PROJECTION_TYPES.length,
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        hospitalId: 'h1',
        branchId: 'b1',
        type: JOB_TYPES.REPORT_PROJECTION_REFRESH,
        payload: expect.objectContaining({
          reportType: ReportProjectionType.GST_SUMMARY,
          branchId: 'b1',
        }),
      }),
    );
  });
});
