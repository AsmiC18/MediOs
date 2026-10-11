import { Injectable, Logger } from '@nestjs/common';
import { Job, ReportProjectionType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { ReportsService } from './reports.service';

export type ReportProjectionRefreshJobPayload = {
  reportType: ReportProjectionType;
  periodFrom: string;
  periodTo: string;
  branchId?: string | null;
  scopeKey?: string;
};

@Injectable()
export class ReportProjectionRefreshJobHandler {
  private readonly logger = new Logger(ReportProjectionRefreshJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  async handle(job: Job, _ctx: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.REPORT_PROJECTION_REFRESH) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = job.payload as ReportProjectionRefreshJobPayload;
    if (!payload?.reportType || !payload.periodFrom || !payload.periodTo) {
      throw new JobPermanentFailureError(
        'Report projection refresh payload requires reportType, periodFrom, periodTo',
      );
    }

    await this.prisma.reportProjection.deleteMany({
      where: {
        hospitalId: job.hospitalId,
        branchId: payload.branchId ?? null,
        reportType: payload.reportType,
        periodFrom: new Date(payload.periodFrom),
        periodTo: new Date(payload.periodTo),
        scopeKey: payload.scopeKey ?? '',
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'report_projection_invalidated_for_refresh',
        jobId: job.id,
        hospitalId: job.hospitalId,
        reportType: payload.reportType,
      }),
    );

    await this.reportsService.materializeProjectionForRefreshJob({
      hospitalId: job.hospitalId,
      branchId: payload.branchId ?? null,
      reportType: payload.reportType,
      periodFrom: new Date(payload.periodFrom),
      periodTo: new Date(payload.periodTo),
    });
  }
}
