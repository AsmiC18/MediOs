export function isProduction(): boolean {
  return process.env.NODE_ENV?.trim() === 'production';
}

export function isTest(): boolean {
  return process.env.NODE_ENV?.trim() === 'test';
}

export function parseBooleanEnv(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return defaultValue;
}

export function isMockModeEnabled(envKey: string): boolean {
  return parseBooleanEnv(process.env[envKey], false);
}
