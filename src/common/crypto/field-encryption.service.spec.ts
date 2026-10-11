import { FieldEncryptionService } from './field-encryption.service';

describe('FieldEncryptionService', () => {
  const keyHex = 'a'.repeat(64);

  it('passes through plaintext when encryption is not configured', () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    const service = new FieldEncryptionService();
    expect(service.encrypt('secret')).toBe('secret');
    expect(service.decrypt('secret')).toBe('secret');
  });

  it('round-trips with configured key', () => {
    process.env.FIELD_ENCRYPTION_KEY = keyHex;
    const service = new FieldEncryptionService();
    const cipher = service.encrypt('abha-token');
    expect(cipher).toMatch(/^v1:/);
    expect(service.decrypt(cipher)).toBe('abha-token');
    delete process.env.FIELD_ENCRYPTION_KEY;
  });
});
