const HPR_ID_PATTERN = /^\d{2}-\d{4}-\d{4}-\d{4}$/;

export function isValidHprId(value: string): boolean {
  return HPR_ID_PATTERN.test(value.trim());
}

export function normalizeHprId(value: string): string {
  return value.trim();
}

export function validateHprId(value: string): string {
  const normalized = normalizeHprId(value);

  if (!isValidHprId(normalized)) {
    throw new Error(
      'Invalid HPR ID format. Expected XX-XXXX-XXXX-XXXX (14 digits with dashes).',
    );
  }

  return normalized;
}

export function maskHprForAudit(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const parts = trimmed.split('-');

  if (parts.length === 4) {
    return `${parts[0]}-****-****-${parts[3]}`;
  }

  if (trimmed.length <= 4) {
    return '****';
  }

  return `${'*'.repeat(Math.max(trimmed.length - 4, 4))}${trimmed.slice(-4)}`;
}
