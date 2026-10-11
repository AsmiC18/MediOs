import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { patientNpsJobIdempotencyKey } from './patient-nps-trigger-event.util';

@Injectable()
export class PatientEngagementAppointmentService {
  constructor(private readonly jobService: JobService) {}

  async enqueueNpsTriggerIfNewlyCompleted(
    tx: Prisma.TransactionClient,
    input: {
      previousStatus: AppointmentStatus;
      appointment: {
        id: string;
        hospitalId: string;
        branchId: string | null;
        patientId: string;
        status: AppointmentStatus;
      };
    },
  ): Promise<void> {
    if (input.appointment.status !== AppointmentStatus.COMPLETED) {
      return;
    }
    if (input.previousStatus === AppointmentStatus.COMPLETED) {
      return;
    }

    await this.jobService.enqueueWithClient(tx, {
      hospitalId: input.appointment.hospitalId,
      branchId: input.appointment.branchId,
      type: JOB_TYPES.PATIENT_NPS_TRIGGER,
      idempotencyKey: patientNpsJobIdempotencyKey(input.appointment.id),
      payload: { appointmentId: input.appointment.id },
      maxAttempts: 5,
    });
  }
}
