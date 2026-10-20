import { validateFieldEncryptionProductionConfig } from '../crypto/field-encryption.config';
import { validatePrivacyRetentionProductionConfig } from '../../privacy/privacy-retention.config';
import {
  validateAbdmCallbackAuthenticationFromEnv,
  validateAbdmRealModeCredentialsFromEnv,
} from './abdm-production-config.util';
import { isMockModeEnabled, isProduction } from './app-environment';
import { isWeakJwtSecret } from './jwt.config';
import { parseCorsOrigins } from './cors.config';

function requireNonEmpty(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required in production.`);
  }
  return value;
}

function assertMockDisabled(label: string, envKey: string): void {
  if (isMockModeEnabled(envKey)) {
    throw new Error(
      `${envKey}=true is not allowed in production (${label} must use real integration mode).`,
    );
  }
}

export function validateProductionConfig(): void {
  if (!isProduction()) {
    return;
  }

  const jwtSecret = requireNonEmpty('JWT_SECRET');
  if (isWeakJwtSecret(jwtSecret)) {
    throw new Error('JWT_SECRET is too weak for production.');
  }

  if (parseCorsOrigins(process.env.CORS_ORIGINS).length === 0) {
    throw new Error('CORS_ORIGINS is required in production.');
  }

  validateFieldEncryptionProductionConfig();

  requireNonEmpty('ABDM_CALLBACK_SECRET');

  assertMockDisabled('ABDM', 'ABDM_MOCK_MODE');
  validateAbdmRealModeCredentialsFromEnv();
  validateAbdmCallbackAuthenticationFromEnv();
  assertMockDisabled('Razorpay', 'RAZORPAY_MOCK_MODE');

  if (!isMockModeEnabled('RAZORPAY_MOCK_MODE')) {
    requireNonEmpty('RAZORPAY_KEY_ID');
    requireNonEmpty('RAZORPAY_KEY_SECRET');
    requireNonEmpty('RAZORPAY_WEBHOOK_SECRET');
  }

  validatePrivacyRetentionProductionConfig();
}
