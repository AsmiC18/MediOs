const DEFAULT_MAX_LENGTH = 500;

const SENSITIVE_KEY =
  /^(password|passwd|secret|token|accessToken|refreshToken|authorization|apiKey|clientSecret|keySecret|webhookSecret|appSecret|access_token|refresh_token|linkToken|providerAccessToken)$/i;

const INLINE_CREDENTIAL =
  /(Bearer\s+[A-Za-z0-9._~+/=-]+|refreshToken["':\s]+[A-Za-z0-9._~+/=-]+|accessToken["':\s]+[A-Za-z0-9._~+/=-]+|password["':\s]+\S+)/gi;

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

function redactString(value: string, maxLength: number): string {
  let redacted = value.replace(INLINE_CREDENTIAL, '[REDACTED]');
  redacted = truncate(redacted, maxLength);
  return redacted;
}

function redactUnknown(value: unknown, maxLength: number, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value, maxLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return redactString(value.message, maxLength);
  }

  if (depth >= 4) {
    return '[TRUNCATED]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => redactUnknown(entry, maxLength, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        result[key] = '[REDACTED]';
        continue;
      }
      if (key === 'content' || key === 'body' || key === 'rawBody' || key === 'payload') {
        result[key] = '[REDACTED]';
        continue;
      }
      result[key] = redactUnknown(entry, maxLength, depth + 1);
    }
    return result;
  }

  return redactString(String(value), maxLength);
}

/** Redacts credential-like values for structured logs and error messages. */
export function redactForLog(
  value: unknown,
  maxLength = DEFAULT_MAX_LENGTH,
): unknown {
  return redactUnknown(value, maxLength, 0);
}

export function redactErrorMessage(
  error: unknown,
  maxLength = DEFAULT_MAX_LENGTH,
): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactString(message, maxLength);
}
