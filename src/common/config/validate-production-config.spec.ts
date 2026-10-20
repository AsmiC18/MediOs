import { validateAbdmRealModeCredentialsFromEnv } from './abdm-production-config.util';
import { validateProductionConfig } from './validate-production-config';

const VALID_FIELD_ENCRYPTION_KEY_HEX = 'b'.repeat(64);

const BASE_PRODUCTION_ENV: Record<string, string | undefined> = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a-very-long-production-jwt-secret-value-123456',
  CORS_ORIGINS: 'https://app.example.com',
  FIELD_ENCRYPTION_KEY: VALID_FIELD_ENCRYPTION_KEY_HEX,
  ABDM_CALLBACK_SECRET: 'abdm-callback-secret-value',
  ABDM_MOCK_MODE: 'false',
  RAZORPAY_MOCK_MODE: 'false',
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'rzp_test_secret',
  RAZORPAY_WEBHOOK_SECRET: 'whsec_test',
  ABDM_SANDBOX_CLIENT_ID: 'sandbox-client-id',
  ABDM_SANDBOX_CLIENT_SECRET: 'sandbox-client-secret',
  ABDM_CALLBACK_JWT_USE_GATEWAY_CERTS: 'true',
};

function withEnv(overrides: Record<string, string | undefined>): void {
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith('ABDM_') ||
      key === 'NODE_ENV' ||
      key === 'JWT_SECRET' ||
      key === 'CORS_ORIGINS' ||
      key === 'FIELD_ENCRYPTION_KEY' ||
      key.startsWith('RAZORPAY_')
    ) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, BASE_PRODUCTION_ENV, overrides);
}

describe('validateProductionConfig (ABDM)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows production when sandbox ABDM credentials are present', () => {
    withEnv({});
    expect(() => validateProductionConfig()).not.toThrow();
  });

  it('does not require WhatsApp env vars in production (Phase B API)', () => {
    withEnv({});
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_MOCK_MODE;
    expect(() => validateProductionConfig()).not.toThrow();
  });

  it('fails when ABDM sandbox client id is missing', () => {
    withEnv({ ABDM_SANDBOX_CLIENT_ID: '' });
    expect(() => validateProductionConfig()).toThrow(
      /ABDM_SANDBOX_CLIENT_ID is required/,
    );
  });

  it('requires production client credentials when ABDM_ENV=production', () => {
    withEnv({
      ABDM_ENV: 'production',
      ABDM_PRODUCTION_CLIENT_ID: 'prod-id',
      ABDM_PRODUCTION_CLIENT_SECRET: 'prod-secret',
    });
    expect(() => validateProductionConfig()).not.toThrow();
  });

  it('fails when callback JWT verification configuration is missing', () => {
    withEnv({
      ABDM_CALLBACK_JWT_USE_GATEWAY_CERTS: '',
      ABDM_CALLBACK_JWT_PUBLIC_KEY: '',
    });
    expect(() => validateProductionConfig()).toThrow(
      /ABDM_CALLBACK_JWT_PUBLIC_KEY or ABDM_CALLBACK_JWT_USE_GATEWAY_CERTS/,
    );
  });

  it('fails when ABDM production client secret is missing', () => {
    withEnv({
      ABDM_ENV: 'production',
      ABDM_PRODUCTION_CLIENT_ID: 'prod-id',
      ABDM_PRODUCTION_CLIENT_SECRET: '',
    });
    expect(() => validateProductionConfig()).toThrow(
      /ABDM_PRODUCTION_CLIENT_SECRET is required/,
    );
  });

  it('does not run production validation in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ABDM_SANDBOX_CLIENT_ID;
    expect(() => validateProductionConfig()).not.toThrow();
  });

  it('fails in production when FIELD_ENCRYPTION_KEY is missing', () => {
    withEnv({ FIELD_ENCRYPTION_KEY: '' });
    expect(() => validateProductionConfig()).toThrow(
      /FIELD_ENCRYPTION_KEY is required in production/,
    );
  });

  it('fails in production when FIELD_ENCRYPTION_KEY is invalid', () => {
    withEnv({ FIELD_ENCRYPTION_KEY: 'invalid-key-material' });
    expect(() => validateProductionConfig()).toThrow(/must decode to 32 bytes/);
  });
});

describe('validateAbdmRealModeCredentialsFromEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('requires sandbox credentials by default', () => {
    delete process.env.ABDM_ENV;
    delete process.env.ABDM_SANDBOX_CLIENT_ID;
    process.env.ABDM_SANDBOX_CLIENT_SECRET = 'secret';
    expect(() => validateAbdmRealModeCredentialsFromEnv()).toThrow(
      /ABDM_SANDBOX_CLIENT_ID/,
    );
  });
});
