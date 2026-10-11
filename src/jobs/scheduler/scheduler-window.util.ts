/**
 * UTC minute scheduling window for deterministic scheduler idempotency keys.
 * Format: YYYY-MM-DDTHH:mmZ (seconds zeroed, UTC).
 */
export function formatUtcMinuteWindow(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}Z`;
}

/**
 * UTC hour scheduling window for hourly jobs (e.g. consent expiry sweep).
 * Format: YYYY-MM-DDTHHZ
 */
export function formatUtcHourWindow(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}Z`;
}

/**
 * UTC day scheduling window for daily jobs (e.g. privacy retention purge).
 * Format: YYYY-MM-DD
 */
export function formatUtcDayWindow(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
