/**
 * Pure env checks for real ABDM mode (mirrors AbdmEnvironmentService credential rules).
 * Used by production startup validation only — no secret values are logged.
 */

function requireNonEmptyEnv(name: string): void {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required in production when ABDM_MOCK_MODE is not enabled.`);
  }
}

function isTruthyEnv(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/** Validates client credentials required for gateway session / link-token in real ABDM mode. */
export function validateAbdmRealModeCredentialsFromEnv(): void {
  const abdmEnv = process.env.ABDM_ENV?.trim().toLowerCase();

  if (abdmEnv === 'production') {
    requireNonEmptyEnv('ABDM_PRODUCTION_CLIENT_ID');
    requireNonEmptyEnv('ABDM_PRODUCTION_CLIENT_SECRET');
    return;
  }

  requireNonEmptyEnv('ABDM_SANDBOX_CLIENT_ID');
  requireNonEmptyEnv('ABDM_SANDBOX_CLIENT_SECRET');
}

/**
 * Real-mode ABDM callbacks must verify gateway JWT signatures in production.
 * Operators supply a PEM public key and/or enable gateway /certs discovery.
 */
export function validateAbdmCallbackAuthenticationFromEnv(): void {
  const hasPublicKey = Boolean(process.env.ABDM_CALLBACK_JWT_PUBLIC_KEY?.trim());
  const useGatewayCerts = isTruthyEnv('ABDM_CALLBACK_JWT_USE_GATEWAY_CERTS');

  if (!hasPublicKey && !useGatewayCerts) {
    throw new Error(
      'ABDM_CALLBACK_JWT_PUBLIC_KEY or ABDM_CALLBACK_JWT_USE_GATEWAY_CERTS=true is required in production when ABDM_MOCK_MODE is not enabled.',
    );
  }
}
