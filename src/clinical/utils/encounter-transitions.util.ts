import { ClinicalEncounterStatus } from '@prisma/client';

export const ALLOWED_ENCOUNTER_TRANSITIONS: Record<
  ClinicalEncounterStatus,
  ClinicalEncounterStatus[]
> = {
  [ClinicalEncounterStatus.OPEN]: [
    ClinicalEncounterStatus.COMPLETED,
    ClinicalEncounterStatus.CANCELLED,
  ],
  [ClinicalEncounterStatus.COMPLETED]: [],
  [ClinicalEncounterStatus.CANCELLED]: [],
};

export function isAllowedEncounterTransition(
  current: ClinicalEncounterStatus,
  next: ClinicalEncounterStatus,
): boolean {
  if (current === next) {
    return false;
  }

  return (ALLOWED_ENCOUNTER_TRANSITIONS[current] ?? []).includes(next);
}
