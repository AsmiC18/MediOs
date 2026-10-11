import { AbdmConsentStatus } from '@prisma/client';

/**
 * Transitions that imply an external ABDM Consent Manager outcome (not implemented in real mode).
 */
export function isExternalConsentManagerTransition(
  currentStatus: AbdmConsentStatus,
  nextStatus: AbdmConsentStatus,
): boolean {
  if (nextStatus === AbdmConsentStatus.REQUESTED) {
    return true;
  }
  if (nextStatus === AbdmConsentStatus.GRANTED) {
    return true;
  }
  if (
    nextStatus === AbdmConsentStatus.DENIED &&
    currentStatus === AbdmConsentStatus.REQUESTED
  ) {
    return true;
  }
  if (
    nextStatus === AbdmConsentStatus.REVOKED &&
    currentStatus === AbdmConsentStatus.GRANTED
  ) {
    return true;
  }
  return false;
}
