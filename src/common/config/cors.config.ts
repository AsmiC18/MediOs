import { isProduction } from './app-environment';

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildCorsOptions():
  | { origin: true }
  | { origin: string[]; credentials: boolean } {
  const configuredOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

  if (isProduction()) {
    if (configuredOrigins.length === 0) {
      throw new Error(
        'CORS_ORIGINS is required in production. Provide a comma-separated list of allowed origins.',
      );
    }

    if (configuredOrigins.includes('*')) {
      throw new Error('CORS_ORIGINS must not include "*" in production.');
    }

    return {
      origin: configuredOrigins,
      credentials: true,
    };
  }

  if (configuredOrigins.length > 0) {
    return {
      origin: configuredOrigins,
      credentials: true,
    };
  }

  return { origin: true };
}
