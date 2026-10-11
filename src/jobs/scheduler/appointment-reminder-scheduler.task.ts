import { Injectable, Logger } from '@nestjs/common';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { truncateJobError } from '../job-error.util';
import { APPOINTMENT_REMINDER_OFFSET_POLICIES } from '../../scheduling/appointments/appointment-reminder-policy.util';
import {
  findAppointmentCandidatesForReminderOffset,
  tryScheduleAppointmentReminder,
} from '../../scheduling/appointments/appointment-reminder-scheduler.util';
import {
  JobSchedulerConfig,
  loadJobSchedulerConfig,
} from './job-scheduler.config';
import {
  schedulerItemSavepoint,
  schedulerItemSavepointName,
} from './scheduler-item-savepoint.util';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';

@Injectable()
export class AppointmentReminderSchedulerTask implements SchedulerTask {
  readonly name = 'appointment-reminder';
  readonly requiresTestHospitalId = false;

  private readonly logger = new Logger(AppointmentReminderSchedulerTask.name);
  private readonly config: JobSchedulerConfig;

  constructor(
    private readonly domainEventOutboxService: DomainEventOutboxService,
  ) {
    this.config = loadJobSchedulerConfig();
  }

  private isOffsetEnabled(
    eventType: string,
    offsetHours: 48 | 24 | 1,
  ): boolean {
    if (!this.config.appointmentReminderSchedulerEnabled) {
      return false;
    }
    if (offsetHours === 48) {
      return this.config.appointmentReminder48hEnabled;
    }
    if (offsetHours === 24) {
      return this.config.appointmentReminder24hOffsetEnabled;
    }
    return this.config.appointmentReminder1hEnabled;
  }

  async run(context: SchedulerExecutionContext): Promise<void> {
    for (const policy of APPOINTMENT_REMINDER_OFFSET_POLICIES) {
      if (!this.isOffsetEnabled(policy.eventType, policy.offsetHours)) {
        continue;
      }

      const candidates = await findAppointmentCandidatesForReminderOffset(
        context.transaction,
        context.tickAt,
        policy.offsetMs,
      );

      for (const candidate of candidates) {
        const savepointName = schedulerItemSavepointName(
          `appointment-reminder:${policy.offsetHours}h:${candidate.id}`,
        );
        await schedulerItemSavepoint(
          context.transaction,
          'SAVEPOINT',
          savepointName,
        );

        try {
          const outcome = await tryScheduleAppointmentReminder(
            context,
            this.domainEventOutboxService,
            candidate.id,
            policy,
          );

          await schedulerItemSavepoint(
            context.transaction,
            'RELEASE SAVEPOINT',
            savepointName,
          );

          if (outcome === 'scheduled') {
            this.logger.log(
              JSON.stringify({
                event: 'appointment_reminder_scheduled',
                appointmentId: candidate.id,
                hospitalId: candidate.hospitalId,
                eventType: policy.eventType,
                offsetHours: policy.offsetHours,
              }),
            );
          }
        } catch (error) {
          await schedulerItemSavepoint(
            context.transaction,
            'ROLLBACK TO SAVEPOINT',
            savepointName,
          );
          this.logger.warn(
            JSON.stringify({
              event: 'appointment_reminder_schedule_failed',
              appointmentId: candidate.id,
              hospitalId: candidate.hospitalId,
              eventType: policy.eventType,
              offsetHours: policy.offsetHours,
              message: truncateJobError(error),
            }),
          );
        }
      }
    }
  }
}

/** @deprecated H5 task name; delegates to unified reminder scheduler. */
@Injectable()
export class AppointmentReminder24hSchedulerTask
  implements SchedulerTask
{
  readonly name = 'appointment-reminder-24h';
  readonly requiresTestHospitalId = false;

  constructor(private readonly unified: AppointmentReminderSchedulerTask) {}

  run(context: SchedulerExecutionContext): Promise<void> {
    return this.unified.run(context);
  }
}
