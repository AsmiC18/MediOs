
import { Prisma } from '@prisma/client';

/**
 * Outbox payload should contain minimal event data and identifiers, not secrets
 * or unnecessary PHI.
 */
export type DomainEventEnvelope = {
  hospitalId: string;
  branchId?: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
};

export type NotificationDispatchJobPayload = {
  outboxId: string;
};
