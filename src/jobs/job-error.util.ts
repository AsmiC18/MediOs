const DEFAULT_MAX_ERROR_LENGTH = 500;

export function truncateJobError(
  error: unknown,
  maxLength = DEFAULT_MAX_ERROR_LENGTH,
): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.length <= maxLength) {
    return message;
  }
  return message.slice(0, maxLength);
}
