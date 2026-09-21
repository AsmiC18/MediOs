export function toQueueDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function startOfQueueDate(queueDate: Date): Date {
  return toQueueDate(queueDate);
}

export function endOfQueueDate(queueDate: Date): Date {
  const start = toQueueDate(queueDate);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function parseQueueDateInput(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid queue date');
  }

  return toQueueDate(parsed);
}
