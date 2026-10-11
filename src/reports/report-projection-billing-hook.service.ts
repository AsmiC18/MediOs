import { Injectable } from '@nestjs/common';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import {
  BILLING_AFFECTED_REPORT_PROJECTION_TYPES,
  invalidateReportProjectionsForBillingMutation,
} from './report-projection-invalidation.util';
import { utcMonthBounds } from './report-projection-period.util';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class ReportProjectionBillingHookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: JobService,
  ) {}

  async onBillingReportAffectingMutation(input: {
    hospitalId: string;
    branchId: string | null;
    referenceAt?: Date;
  }): Promise<void> {
    await invalidateReportProjectionsForBillingMutation(this.prisma, {
      hospitalId: input.hospitalId,
      branchId: input.branchId,
    });

    const { periodFrom, periodTo } = utcMonthBounds(input.referenceAt ?? new Date());
    const branchKey = input.branchId ?? 'hospital';

    for (const reportType of BILLING_AFFECTED_REPORT_PROJECTION_TYPES) {
      await this.jobService.enqueue({
        hospitalId: input.hospitalId,
        branchId: input.branchId,
        type: JOB_TYPES.REPORT_PROJECTION_REFRESH,
        idempotencyKey: `billing-refresh:${branchKey}:${reportType}:${periodFrom.toISOString()}:${periodTo.toISOString()}`,
        maxAttempts: 5,
        payload: {
          reportType,
          periodFrom: periodFrom.toISOString(),
          periodTo: periodTo.toISOString(),
          branchId: input.branchId,
        },
      });
    }
  }
}
