import { PrescriptionSafetyFindingType } from '@prisma/client';
import { AllergyWarning } from './medication-safety.util';
import { SafetyFindingDraft } from '../safety/safety.types';

export function mapAllergyWarningsFromFindings(
  findings: SafetyFindingDraft[],
): AllergyWarning[] {
  return findings
    .filter((f) => f.findingType === PrescriptionSafetyFindingType.ALLERGY)
    .map((f) => {
      const detail = (f.detailJson ?? {}) as {
        medicationName?: string;
        allergy?: string;
      };
      return {
        medicationName: detail.medicationName ?? 'unknown',
        allergy: detail.allergy ?? 'documented allergy',
        message: f.summary,
      };
    });
}
