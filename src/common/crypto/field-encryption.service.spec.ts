import { FieldEncryptionService } from './field-encryption.service';

describe('FieldEncryptionService', () => {
  const keyHex = 'a'.repeat(64);
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.FIELD_ENCRYPTION_KEY;
  });

  it('passes through plaintext in non-production when encryption is not configured', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.FIELD_ENCRYPTION_KEY;
    const service = new FieldEncryptionService();
    expect(service.encrypt('secret')).toBe('secret');
    expect(service.decrypt('secret')).toBe('secret');
  });

  it('throws on encrypt in production when encryption is not configured', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FIELD_ENCRYPTION_KEY;
    const service = new FieldEncryptionService();
    expect(() => service.encrypt('secret')).toThrow(
      /FIELD_ENCRYPTION_KEY is required in production/,
    );
  });

  it('round-trips with configured key', () => {
    process.env.FIELD_ENCRYPTION_KEY = keyHex;
    const service = new FieldEncryptionService();
    const cipher = service.encrypt('abha-token');
    expect(cipher).toMatch(/^v1:/);
    expect(service.decrypt(cipher)).toBe('abha-token');
  });

  it('throws when constructor receives an invalid key', () => {
    process.env.FIELD_ENCRYPTION_KEY = 'too-short';
    expect(() => new FieldEncryptionService()).toThrow(/must decode to 32 bytes/);
  });
});
