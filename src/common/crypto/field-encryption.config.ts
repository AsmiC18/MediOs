import { isProduction } from '../config/app-environment';

export const FIELD_ENCRYPTION_KEY_ENV = 'FIELD_ENCRYPTION_KEY';

/**
 * Decodes FIELD_ENCRYPTION_KEY (64-char hex or base64) to a 32-byte AES-256 key.
 * Throws if the decoded length is not 32 bytes.
 */
export function decodeFieldEncryptionKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = Buffer.from(trimmed, trimmed.length === 64 ? 'hex' : 'base64');
  if (key.length !== 32) {
    throw new Error(`${FIELD_ENCRYPTION_KEY_ENV} must decode to 32 bytes`);
  }
  return key;
}

export function getFieldEncryptionKeyFromEnv(): Buffer | null {
  const raw = process.env[FIELD_ENCRYPTION_KEY_ENV]?.trim();
  if (!raw) {
    return null;
  }
  return decodeFieldEncryptionKey(raw);
}

/** Fail closed in production when the encryption key is missing or invalid. */
export function validateFieldEncryptionProductionConfig(): void {
  if (!isProduction()) {
    return;
  }

  const raw = process.env[FIELD_ENCRYPTION_KEY_ENV]?.trim();
  if (!raw) {
    throw new Error(`${FIELD_ENCRYPTION_KEY_ENV} is required in production.`);
  }

  decodeFieldEncryptionKey(raw);
}
