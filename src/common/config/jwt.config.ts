import { isProduction } from './app-environment';

const WEAK_JWT_SECRETS = new Set([
  'change-me',
  'dev-secret-change-me',
  'secret',
  'jwt_secret',
  'your-secret-key',
  'changeme',
]);

export function isWeakJwtSecret(secret: string): boolean {
  const normalized = secret.trim().toLowerCase();
  return normalized.length < 32 || WEAK_JWT_SECRETS.has(normalized);
}

export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error(
      'JWT_SECRET is required. Set a strong secret in your environment (see .env.example).',
    );
  }

  if (isProduction() && isWeakJwtSecret(secret)) {
    throw new Error(
      'JWT_SECRET is too weak for production. Use at least 32 characters and avoid default values.',
    );
  }

  return secret;
}
