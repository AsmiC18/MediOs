const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60] as const;

/** Computes the next `availableAt` after a failed attempt (1-based attempt count). */
export function computeRetryAvailableAt(
  attempts: number,
  from: Date = new Date(),
): Date {
  const index = Math.min(
    Math.max(attempts - 1, 0),
    RETRY_BACKOFF_MINUTES.length - 1,
  );
  const minutes = RETRY_BACKOFF_MINUTES[index];
  return new Date(from.getTime() + minutes * 60 * 1000);
}
