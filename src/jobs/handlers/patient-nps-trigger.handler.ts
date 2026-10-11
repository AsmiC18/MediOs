import { Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus, Job } from '@prisma/client';
import { JobPermanentFailureError } from '../job-permanent-failure.error';
import { JobExecutionContext } from '../job-handler.types';
import { JOB_TYPES } from '../job-types.constants';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { buildPatientNpsRequestDomainEvent } from '../../engagement/patient-nps-trigger-event.util';

type PatientNpsTriggerPayload = {
  appointmentId?: string;
};

@Injectable()
export class PatientNpsTriggerHandler {
  private readonly logger = new Logger(PatientNpsTriggerHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.PATIENT_NPS_TRIGGER) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = job.payload as PatientNpsTriggerPayload;
    const appointmentId = payload?.appointmentId;
    if (!appointmentId) {
      throw new JobPermanentFailureError(
        'patient.nps.trigger job requires appointmentId',
      );
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, hospitalId: job.hospitalId },
    });

    if (!appointment) {
      throw new JobPermanentFailureError('Appointment not found for NPS trigger');
    }

    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new JobPermanentFailureError(
        'Appointment is not completed; skipping NPS trigger',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const outbox = await this.domainEventOutboxService.createInTransaction(
        tx,
        buildPatientNpsRequestDomainEvent({
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          hospitalId: appointment.hospitalId,
          branchId: appointment.branchId,
        }),
      );

      await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: appointment.hospitalId,
        branchId: appointment.branchId,
        outboxId: outbox.id,
      });
    });

    this.logger.log(
      JSON.stringify({
        event: 'patient_nps_trigger_completed',
        jobId: job.id,
        workerId: workerContext.workerId,
        appointmentId,
        hospitalId: job.hospitalId,
      }),
    );
  }
}
