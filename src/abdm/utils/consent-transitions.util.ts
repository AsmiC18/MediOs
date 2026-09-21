import { AbdmConsentStatus } from '@prisma/client';

export const ALLOWED_CONSENT_TRANSITIONS: Record<
  AbdmConsentStatus,
  AbdmConsentStatus[]
> = {
  [AbdmConsentStatus.DRAFT]: [
    AbdmConsentStatus.REQUESTED,
    AbdmConsentStatus.DENIED,
  ],
  [AbdmConsentStatus.REQUESTED]: [
    AbdmConsentStatus.GRANTED,
    AbdmConsentStatus.DENIED,
    AbdmConsentStatus.EXPIRED,
  ],
  [AbdmConsentStatus.GRANTED]: [
    AbdmConsentStatus.REVOKED,
    AbdmConsentStatus.EXPIRED,
  ],
  [AbdmConsentStatus.DENIED]: [],
  [AbdmConsentStatus.EXPIRED]: [],
  [AbdmConsentStatus.REVOKED]: [],
};

export function isAllowedConsentTransition(
  currentStatus: AbdmConsentStatus,
  nextStatus: AbdmConsentStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return false;
  }

  return (ALLOWED_CONSENT_TRANSITIONS[currentStatus] ?? []).includes(nextStatus);
}
