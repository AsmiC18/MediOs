const ICD10_PATTERN = /^[A-TV-Z][0-9][0-9AB](?:\.[0-9A-TV-Z]{1,4})?$/;

export function normalizeIcd10Code(value: string): string {
  return value.trim().toUpperCase();
}

export function validateIcd10Code(value: string): string {
  const normalized = normalizeIcd10Code(value);

  if (!normalized) {
    throw new Error('ICD-10 code is required');
  }

  if (!ICD10_PATTERN.test(normalized)) {
    throw new Error(
      'Invalid ICD-10 code format. Expected patterns like A00, J06.9, or E11.65',
    );
  }

  return normalized;
}
