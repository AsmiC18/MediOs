import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { SchedulerExecutionContext } from '../../jobs/scheduler/scheduler.types';
import { APPOINTMENT_REMINDER_24H_OFFSET_MS } from './appointment-reminder-policy.util';
import {
  APPOINTMENT_REMINDER_BATCH_SIZE,
  APPOINTMENT_REMINDER_SCHEDULER_WINDOW_MS,
  computeReminderStartAtWindowUtc,
  findAppointmentCandidatesForReminderOffset,
  ScheduleReminderOutcome,
  tryScheduleAppointmentReminder,
} from './appointment-reminder-scheduler.util';
import { APPOINTMENT_REMINDER_OFFSET_POLICIES } from './appointment-reminder-policy.util';

/** Reminder is sent 24 hours before appointment start (elapsed ms, same instant semantics as H5). */
export { APPOINTMENT_REMINDER_24H_OFFSET_MS };

export { APPOINTMENT_REMINDER_SCHEDULER_WINDOW_MS };

export const APPOINTMENT_REMINDER_24H_BATCH_SIZE = APPOINTMENT_REMINDER_BATCH_SIZE;

const REMINDER_24H_POLICY = APPOINTMENT_REMINDER_OFFSET_POLICIES.find(
  (policy) => policy.offsetHours === 24,
)!;

export function computeReminder24hStartWindow(tickAt: Date): {
  windowStart: Date;
  windowEnd: Date;
} {
  return computeReminderStartAtWindowUtc(tickAt, APPOINTMENT_REMINDER_24H_OFFSET_MS);
}

export async function findAppointmentCandidatesForReminder24h(
  transaction: Parameters<typeof findAppointmentCandidatesForReminderOffset>[0],
  tickAt: Date,
  take = APPOINTMENT_REMINDER_24H_BATCH_SIZE,
) {
  return findAppointmentCandidatesForReminderOffset(
    transaction,
    tickAt,
    APPOINTMENT_REMINDER_24H_OFFSET_MS,
    take,
  );
}

export type ScheduleReminder24hOutcome = ScheduleReminderOutcome;

export async function tryScheduleAppointmentReminder24h(
  context: SchedulerExecutionContext,
  outboxService: DomainEventOutboxService,
  appointmentId: string,
): Promise<ScheduleReminder24hOutcome> {
  return tryScheduleAppointmentReminder(
    context,
    outboxService,
    appointmentId,
    REMINDER_24H_POLICY,
  );
}
