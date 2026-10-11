import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { PatientPrivacyErasureService } from '../../privacy/patient-privacy-erasure.service';
import { JobExecutionContext } from '../job-handler.types';
import { JOB_TYPES } from '../job-types.constants';

type ErasureJobPayload = {
  erasureRequestId: string;
  patientId: string;
  actorUserId: string;
};

@Injectable()
export class PatientPrivacyErasureHandler {
  private readonly logger = new Logger(PatientPrivacyErasureHandler.name);

  constructor(
    private readonly patientPrivacyErasureService: PatientPrivacyErasureService,
  ) {}

  async handle(job: Job, _context: JobExecutionContext) {
    if (job.type !== JOB_TYPES.PATIENT_PRIVACY_ERASURE) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = job.payload as ErasureJobPayload;
    const result = await this.patientPrivacyErasureService.processErasureJob(
      payload,
    );

    this.logger.log(
      JSON.stringify({
        event: 'patient_privacy_erasure_job_completed',
        jobId: job.id,
        hospitalId: job.hospitalId,
        patientId: payload.patientId,
        erasureRequestId: payload.erasureRequestId,
        result,
      }),
    );

    return result;
  }
}
