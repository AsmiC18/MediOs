import { AppointmentStatus, Prisma } from '@prisma/client';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { SchedulerExecutionContext } from '../../jobs/scheduler/scheduler.types';
import { buildAppointmentReminderDomainEvent } from './appointment-reminder-event.util';
import { AppointmentReminderOffsetPolicy } from './appointment-reminder-policy.util';
import {
  computeReminderStartAtWindow,
  resolveAppointmentReminderTimezone,
} from './appointment-reminder-timezone.util';

/** Narrow window per scheduler minute tick (matches default JOB_SCHEDULER_INTERVAL_MS). */
export const APPOINTMENT_REMINDER_SCHEDULER_WINDOW_MS = 60_000;

export const APPOINTMENT_REMINDER_BATCH_SIZE = 100;

/** UTC batch query timezone (H5-compatible candidate scan). */
export const APPOINTMENT_REMINDER_CANDIDATE_QUERY_TIMEZONE = 'UTC';

export function computeReminderStartAtWindowUtc(
  tickAt: Date,
  offsetMs: number,
): { windowStart: Date; windowEnd: Date } {
  return computeReminderStartAtWindow(
    tickAt,
    offsetMs,
    APPOINTMENT_REMINDER_CANDIDATE_QUERY_TIMEZONE,
  );
}

export async function findAppointmentCandidatesForReminderOffset(
  transaction: Prisma.TransactionClient,
  tickAt: Date,
  offsetMs: number,
  take = APPOINTMENT_REMINDER_BATCH_SIZE,
): Promise<Array<{ id: string; hospitalId: string }>> {
  const { windowStart, windowEnd } = computeReminderStartAtWindowUtc(
    tickAt,
    offsetMs,
  );

  return transaction.appointment.findMany({
    where: {
      status: AppointmentStatus.SCHEDULED,
      startAt: {
        gte: windowStart,
        lt: windowEnd,
      },
    },
    select: {
      id: true,
      hospitalId: true,
    },
    orderBy: [{ hospitalId: 'asc' }, { startAt: 'asc' }, { id: 'asc' }],
    take,
  });
}

export type ScheduleReminderOutcome =
  | 'scheduled'
  | 'skipped'
  | 'already_scheduled';

/**
 * Schedules one reminder outbox + notification.dispatch job atomically for an appointment offset.
 * Re-reads appointment state inside the scheduler transaction (cancellation/reschedule races).
 */
export async function tryScheduleAppointmentReminder(
  context: SchedulerExecutionContext,
  outboxService: DomainEventOutboxService,
  appointmentId: string,
  policy: AppointmentReminderOffsetPolicy,
): Promise<ScheduleReminderOutcome> {
  const tx = context.transaction;

  const preloaded = await tx.appointment.findFirst({
    where: {
      id: appointmentId,
      status: AppointmentStatus.SCHEDULED,
    },
  });

  if (!preloaded?.patientId) {
    return 'skipped';
  }

  const timezone = await resolveAppointmentReminderTimezone(tx, {
    hospitalId: preloaded.hospitalId,
    branchId: preloaded.branchId,
  });

  const { windowStart, windowEnd } = computeReminderStartAtWindow(
    context.tickAt,
    policy.offsetMs,
    timezone,
  );

  if (
    preloaded.startAt < windowStart ||
    preloaded.startAt >= windowEnd
  ) {
    return 'skipped';
  }

  const appointment = preloaded;

  const patient = await tx.patient.findFirst({
    where: {
      id: appointment.patientId,
      hospitalId: appointment.hospitalId,
    },
    select: { id: true },
  });
  if (!patient) {
    return 'skipped';
  }

  const idempotencyKey = `${policy.eventType}:${appointment.id}`;
  const existingOutbox = await tx.domainEventOutbox.findUnique({
    where: {
      hospitalId_idempotencyKey: {
        hospitalId: appointment.hospitalId,
        idempotencyKey,
      },
    },
  });
  if (existingOutbox) {
    return 'already_scheduled';
  }

  const envelope = buildAppointmentReminderDomainEvent(
    appointment,
    policy.offsetHours,
  );
  const outbox = await outboxService.createInTransaction(tx, envelope);
  await outboxService.enqueueDispatchInTransaction(tx, {
    hospitalId: appointment.hospitalId,
    branchId: appointment.branchId,
    outboxId: outbox.id,
  });

  return 'scheduled';
}
