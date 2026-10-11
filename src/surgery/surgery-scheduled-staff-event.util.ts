import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_UNROUTED } from '../notifications/notification.constants';
import { DomainEventEnvelope } from '../notifications/domain-event.types';

export const SURGERY_SCHEDULED_STAFF_EVENT_TYPE = 'surgery.scheduled';

export type SurgeryScheduledStaffEventInput = {
  surgeryRequestId: string;
  scheduleId: string;
  procedureName: string;
  hospitalId: string;
  branchId: string | null;
  startAt: string;
};

export function surgeryScheduledStaffIdempotencyKey(scheduleId: string): string {
  return `${SURGERY_SCHEDULED_STAFF_EVENT_TYPE}:${scheduleId}`;
}

export function buildSurgeryScheduledStaffDomainEvent(
  input: SurgeryScheduledStaffEventInput,
): DomainEventEnvelope {
  const payload = {
    surgeryRequestId: input.surgeryRequestId,
    scheduleId: input.scheduleId,
    procedureName: input.procedureName,
    startAt: input.startAt,
    channel: NOTIFICATION_CHANNEL_UNROUTED,
    summary: `Surgery "${input.procedureName}" scheduled for ${input.startAt}.`,
  };

  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: SURGERY_SCHEDULED_STAFF_EVENT_TYPE,
    entityType: 'SurgerySchedule',
    entityId: input.scheduleId,
    idempotencyKey: surgeryScheduledStaffIdempotencyKey(input.scheduleId),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
