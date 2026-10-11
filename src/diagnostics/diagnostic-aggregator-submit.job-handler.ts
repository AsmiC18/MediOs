import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { DiagnosticAggregatorService } from './diagnostic-aggregator.service';

type SubmitJobPayload = { orderId?: string };

@Injectable()
export class DiagnosticAggregatorSubmitJobHandler {
  private readonly logger = new Logger(DiagnosticAggregatorSubmitJobHandler.name);

  constructor(
    private readonly diagnosticAggregatorService: DiagnosticAggregatorService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.DIAGNOSTIC_AGGREGATOR_SUBMIT) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const orderId = (job.payload as SubmitJobPayload)?.orderId;
    if (!orderId) {
      throw new Error('Diagnostic aggregator submit job requires orderId');
    }

    const result =
      await this.diagnosticAggregatorService.processAggregatorSubmitJob({
        hospitalId: job.hospitalId,
        orderId,
        jobId: job.id,
        workerId: workerContext.workerId,
      });

    this.logger.log(
      JSON.stringify({
        event: 'diagnostic_aggregator_submit_completed',
        jobId: job.id,
        hospitalId: job.hospitalId,
        orderId,
        outcome: result.outcome,
      }),
    );
  }
}
