import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { PatientsService } from '../../patients/patients.service';
import { JobExecutionContext } from '../job-handler.types';
import { JOB_TYPES } from '../job-types.constants';
import { SystemJobExecutionContext } from '../system-job.types';

export type PatientAtRiskEvaluateHandlerResult = {
  evaluatedCount: number;
  atRiskCount: number;
};

@Injectable()
export class PatientAtRiskEvaluateHandler {
  private readonly logger = new Logger(PatientAtRiskEvaluateHandler.name);

  constructor(private readonly patientsService: PatientsService) {}

  async handle(
    job: Job,
    workerContext: JobExecutionContext,
  ): Promise<PatientAtRiskEvaluateHandlerResult> {
    if (job.type !== JOB_TYPES.PATIENT_AT_RISK_EVALUATE) {
      throw new Error(
        `Unexpected job type for patient at-risk handler: ${job.type}`,
      );
    }

    if (!job.hospitalId) {
      throw new Error('Patient at-risk job requires hospitalId');
    }

    const systemContext: SystemJobExecutionContext = {
      jobId: job.id,
      jobType: job.type,
      workerId: workerContext.workerId,
      hospitalId: job.hospitalId,
      branchId: job.branchId,
    };

    const started = Date.now();
    const { evaluatedCount, atRiskCount } =
      await this.patientsService.evaluateHospitalPatientsAtRiskForSystemJob(
        systemContext,
      );

    const durationMs = Date.now() - started;
    this.logger.log(
      JSON.stringify({
        event: 'patient_at_risk_evaluate_completed',
        jobId: job.id,
        hospitalId: job.hospitalId,
        workerId: workerContext.workerId,
        evaluatedCount,
        atRiskCount,
        durationMs,
        outcome: 'completed',
      }),
    );

    return { evaluatedCount, atRiskCount };
  }
}
