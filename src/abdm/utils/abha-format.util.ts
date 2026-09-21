export function isValidAbhaNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{14}$/.test(trimmed)) {
    return false;
  }

  return true;
}

export function isValidAbhaAddress(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 64) {
    return false;
  }

  return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(trimmed);
}

export function validateAbhaIdentifiers(input: {
  abhaNumber?: string;
  abhaAddress?: string;
}): { abhaNumber?: string; abhaAddress?: string } {
  const abhaNumber = input.abhaNumber?.trim();
  const abhaAddress = input.abhaAddress?.trim();

  if (!abhaNumber && !abhaAddress) {
    throw new Error('Either abhaNumber or abhaAddress is required');
  }

  if (abhaNumber && !isValidAbhaNumber(abhaNumber)) {
    throw new Error('Invalid ABHA number format');
  }

  if (abhaAddress && !isValidAbhaAddress(abhaAddress)) {
    throw new Error('Invalid ABHA address format');
  }

  return {
    abhaNumber: abhaNumber || undefined,
    abhaAddress: abhaAddress || undefined,
  };
}

export function resolveCanonicalAbhaId(input: {
  abhaNumber?: string | null;
  abhaAddress?: string | null;
}): string | null {
  if (input.abhaNumber?.trim()) {
    return input.abhaNumber.trim();
  }

  if (input.abhaAddress?.trim()) {
    return input.abhaAddress.trim();
  }

  return null;
}

export function maskAbhaForAudit(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return '****';
  }

  return `${'*'.repeat(Math.max(trimmed.length - 4, 4))}${trimmed.slice(-4)}`;
}
