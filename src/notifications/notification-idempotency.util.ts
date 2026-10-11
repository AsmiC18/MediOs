/**
 * Deterministic notification idempotency for a consumed outbox row.
 * Same outbox always maps to the same Notification idempotency key.
 */
export function notificationIdempotencyKeyForOutbox(outboxId: string): string {
  return `notification:${outboxId}`;
}
