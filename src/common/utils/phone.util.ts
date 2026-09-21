import { BadRequestException, ConflictException } from '@nestjs/common';

const INDIAN_COUNTRY_CODE = '91';
const INDIAN_MOBILE_LENGTH = 10;
const CANONICAL_PREFIX = '+91';

function extractIndianMobileDigits(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  let digits = input.trim().replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  if (digits.length === INDIAN_MOBILE_LENGTH) {
    return digits;
  }

  if (digits.startsWith(INDIAN_COUNTRY_CODE) && digits.length === 12) {
    return digits.slice(INDIAN_COUNTRY_CODE.length);
  }

  if (digits.startsWith('0') && digits.length === INDIAN_MOBILE_LENGTH + 1) {
    return digits.slice(1);
  }

  return null;
}

function assertValidIndianMobile(localDigits: string): void {
  if (!/^[6-9]\d{9}$/.test(localDigits)) {
    throw new BadRequestException('Invalid Indian mobile phone number');
  }
}

export function canonicalizePatientPhone(input: string): string {
  const localDigits = extractIndianMobileDigits(input);

  if (!localDigits) {
    throw new BadRequestException('Invalid phone number format');
  }

  assertValidIndianMobile(localDigits);
  return `${CANONICAL_PREFIX}${localDigits}`;
}

export function tryCanonicalizePatientPhone(input: string): string | null {
  try {
    return canonicalizePatientPhone(input);
  } catch {
    return null;
  }
}

export function toWhatsAppRecipientId(canonicalPhone: string): string {
  const canonical = canonicalizePatientPhone(canonicalPhone);
  return canonical.slice(1);
}

export function inboundWaIdToCanonicalPhone(waId: string): string | null {
  return tryCanonicalizePatientPhone(waId);
}

export function assertUniquePatientPhoneLookup<T extends { id: string }>(
  matches: T[],
  context: string,
): T | null {
  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    throw new ConflictException(
      `Ambiguous patient phone match for ${context}. Canonical phone maps to multiple patients.`,
    );
  }

  return matches[0];
}
