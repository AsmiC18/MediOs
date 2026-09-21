const HFR_ID_PATTERN = /^IN\d{10}$/;

export function isValidHfrId(value: string): boolean {
  return HFR_ID_PATTERN.test(value.trim().toUpperCase());
}

export function normalizeHfrId(value: string): string {
  return value.trim().toUpperCase();
}

export function validateHfrId(value: string): string {
  const normalized = normalizeHfrId(value);

  if (!isValidHfrId(normalized)) {
    throw new Error('Invalid HFR ID format. Expected IN followed by 10 digits.');
  }

  return normalized;
}

export function mapHfrFacilityStatusToRegistrationStatus(
  facilityStatus: string | null | undefined,
): 'PENDING' | 'REGISTERED' | 'SUSPENDED' | null {
  if (!facilityStatus) {
    return null;
  }

  const normalized = facilityStatus.trim().toLowerCase();

  if (normalized === 'approved') {
    return 'REGISTERED';
  }

  if (normalized === 'suspended') {
    return 'SUSPENDED';
  }

  if (normalized === 'submitted' || normalized === 'draft') {
    return 'PENDING';
  }

  return 'PENDING';
}
