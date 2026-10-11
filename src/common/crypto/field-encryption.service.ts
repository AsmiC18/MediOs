import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION_PREFIX = 'v1:';

@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer | null;

  constructor() {
    const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();
    if (!raw) {
      this.key = null;
      return;
    }
    const key = Buffer.from(raw, raw.length === 64 ? 'hex' : 'base64');
    if (key.length !== 32) {
      throw new Error('FIELD_ENCRYPTION_KEY must decode to 32 bytes');
    }
    this.key = key;
  }

  isConfigured(): boolean {
    return this.key != null;
  }

  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext == null || plaintext === '') {
      return null;
    }
    if (!this.key) {
      return plaintext;
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${VERSION_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
  }

  decrypt(value: string | null | undefined): string | null {
    if (value == null || value === '') {
      return null;
    }
    if (!value.startsWith(VERSION_PREFIX)) {
      return value;
    }
    if (!this.key) {
      throw new Error('FIELD_ENCRYPTION_KEY required to decrypt protected field');
    }
    const payload = Buffer.from(value.slice(VERSION_PREFIX.length), 'base64');
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
    return plain;
  }
}
