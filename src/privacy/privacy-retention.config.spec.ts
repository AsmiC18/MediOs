import {
  loadPrivacyRetentionConfig,
  validatePrivacyRetentionProductionConfig,
} from './privacy-retention.config';

describe('privacy-retention.config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults retention to disabled', () => {
    delete process.env.PRIVACY_RETENTION_ENABLED;
    expect(loadPrivacyRetentionConfig().enabled).toBe(false);
  });

  it('rejects invalid production retention when enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.PRIVACY_RETENTION_ENABLED = 'true';
    process.env.PRIVACY_RETENTION_AUDIT_LOG_DAYS = '0';

    expect(() => validatePrivacyRetentionProductionConfig()).toThrow(
      /PRIVACY_RETENTION_AUDIT_LOG_DAYS/,
    );
  });
});
