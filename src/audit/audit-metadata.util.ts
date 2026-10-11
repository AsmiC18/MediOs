import { Prisma } from '@prisma/client';

const SENSITIVE_KEY =
  /^(password|passwd|secret|token|accessToken|refreshToken|authorization|apiKey|clientSecret|keySecret|webhookSecret|appSecret|access_token|refresh_token|linkToken|content|rawBody|body|text|message|subjective|objective|assessment|plan|templateParameters|emergencyContacts|allergies|chronicConditions)$/i;

const MAX_METADATA_DEPTH = 6;
const MAX_STRING_LENGTH = 512;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 40;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeScalar(value: unknown): Prisma.InputJsonValue {
  if (value === undefined || value === null) {
    return null as unknown as Prisma.InputJsonValue;
  }
  if (typeof value === 'string') {
    if (/Bearer\s+/i.test(value) || value.length > 2000) {
      return '[REDACTED]';
    }
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value).slice(0, MAX_STRING_LENGTH);
}

export function sanitizeAuditMetadata(
  metadata: Prisma.InputJsonValue | undefined,
  depth = 0,
): Prisma.InputJsonValue | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  if (depth >= MAX_METADATA_DEPTH) {
    return '[TRUNCATED]';
  }

  if (metadata === null) {
    return null as unknown as Prisma.InputJsonValue;
  }

  if (Array.isArray(metadata)) {
    const items = metadata
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeAuditMetadata(entry as Prisma.InputJsonValue, depth + 1));
    return items as Prisma.InputJsonValue;
  }

  if (!isPlainObject(metadata)) {
    return sanitizeScalar(metadata);
  }

  const sanitized: Record<string, Prisma.InputJsonValue> = {};
  const entries = Object.entries(metadata).slice(0, MAX_OBJECT_KEYS);

  for (const [key, value] of entries) {
    if (SENSITIVE_KEY.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (value === null) {
      sanitized[key] = null as unknown as Prisma.InputJsonValue;
      continue;
    }

    if (typeof value === 'object') {
      const nested = sanitizeAuditMetadata(value as Prisma.InputJsonValue, depth + 1);
      if (nested !== undefined) {
        sanitized[key] = nested;
      }
      continue;
    }

    sanitized[key] = sanitizeScalar(value) as Prisma.InputJsonValue;
  }

  return sanitized;
}
