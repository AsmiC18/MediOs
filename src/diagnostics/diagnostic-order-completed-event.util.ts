import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_UNROUTED } from '../notifications/notification.constants';
import { DomainEventEnvelope } from '../notifications/domain-event.types';

export const DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE = 'diagnostic.order.completed';

export const DIAGNOSTIC_ORDER_ENTITY_TYPE = 'DiagnosticOrder';

export type DiagnosticOrderCompletedEventSnapshot = {
  diagnosticOrderId: string;
  orderNumber: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  completedByUserId: string;
  itemCount: number;
  channel: typeof NOTIFICATION_CHANNEL_UNROUTED;
  summary: string;
};

export type DiagnosticOrderCompletedEventInput = {
  diagnosticOrderId: string;
  orderNumber: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  completedByUserId: string;
  itemCount: number;
};

export function diagnosticOrderCompletedIdempotencyKey(
  diagnosticOrderId: string,
): string {
  return `${DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE}:${diagnosticOrderId}`;
}

export function buildDiagnosticOrderCompletedDomainEvent(
  input: DiagnosticOrderCompletedEventInput,
): DomainEventEnvelope {
  const payload: DiagnosticOrderCompletedEventSnapshot = {
    diagnosticOrderId: input.diagnosticOrderId,
    orderNumber: input.orderNumber,
    patientId: input.patientId,
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    completedByUserId: input.completedByUserId,
    itemCount: input.itemCount,
    channel: NOTIFICATION_CHANNEL_UNROUTED,
    summary: `Diagnostic order ${input.orderNumber} completed (${input.itemCount} test(s)).`,
  };

  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE,
    entityType: DIAGNOSTIC_ORDER_ENTITY_TYPE,
    entityId: input.diagnosticOrderId,
    idempotencyKey: diagnosticOrderCompletedIdempotencyKey(input.diagnosticOrderId),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
