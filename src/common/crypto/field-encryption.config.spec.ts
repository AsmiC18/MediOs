import {
  decodeFieldEncryptionKey,
  validateFieldEncryptionProductionConfig,
} from './field-encryption.config';

const VALID_KEY_HEX = 'a'.repeat(64);

describe('field-encryption.config', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalKey = process.env.FIELD_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalKey === undefined) {
      delete process.env.FIELD_ENCRYPTION_KEY;
    } else {
      process.env.FIELD_ENCRYPTION_KEY = originalKey;
    }
  });

  describe('decodeFieldEncryptionKey', () => {
    it('accepts 64-character hex encoding 32 bytes', () => {
      const key = decodeFieldEncryptionKey(VALID_KEY_HEX);
      expect(key.length).toBe(32);
    });

    it('rejects keys that decode to the wrong length', () => {
      expect(() => decodeFieldEncryptionKey('abcd')).toThrow(
        /must decode to 32 bytes/,
      );
    });
  });

  describe('validateFieldEncryptionProductionConfig', () => {
    it('does nothing outside production', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.FIELD_ENCRYPTION_KEY;
      expect(() => validateFieldEncryptionProductionConfig()).not.toThrow();
    });

    it('fails in production when the key is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.FIELD_ENCRYPTION_KEY;
      expect(() => validateFieldEncryptionProductionConfig()).toThrow(
        /FIELD_ENCRYPTION_KEY is required in production/,
      );
    });

    it('fails in production when the key is invalid', () => {
      process.env.NODE_ENV = 'production';
      process.env.FIELD_ENCRYPTION_KEY = 'not-a-valid-key';
      expect(() => validateFieldEncryptionProductionConfig()).toThrow(
        /must decode to 32 bytes/,
      );
    });

    it('passes in production with a valid key', () => {
      process.env.NODE_ENV = 'production';
      process.env.FIELD_ENCRYPTION_KEY = VALID_KEY_HEX;
      expect(() => validateFieldEncryptionProductionConfig()).not.toThrow();
    });
  });
});
