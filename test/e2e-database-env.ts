import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { resolveIsolatedE2eDatabaseUrl } from './support/isolated-test-database.util';

function loadDotEnvValue(key: string): string | undefined {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) {
    return undefined;
  }
  const pattern = new RegExp(`^${key}=(.+)$`, 'm');
  const match = readFileSync(envPath, 'utf8').match(pattern);
  if (!match) {
    return undefined;
  }
  return match[1].trim().replace(/^"|"$/g, '');
}

const configuredUrl =
  process.env.DATABASE_URL?.trim() || loadDotEnvValue('DATABASE_URL');
if (!configuredUrl) {
  throw new Error(
    'DATABASE_URL must be set (or present in .env) before HTTP e2e tests run',
  );
}

if (!process.env.JWT_SECRET?.trim()) {
  const jwtSecret = loadDotEnvValue('JWT_SECRET');
  if (jwtSecret) {
    process.env.JWT_SECRET = jwtSecret;
  }
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = resolveIsolatedE2eDatabaseUrl(configuredUrl);
