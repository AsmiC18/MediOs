import {
  ClinicalSafetyPolicyAction,
  DrugResolutionStatus,
  InteractionWhenUnavailable,
  PrescriptionSafetyFindingType,
  PrescriptionSafetySeverity,
} from '@prisma/client';
import { AllergyEvaluator } from './allergy-evaluator';

describe('AllergyEvaluator', () => {
  const evaluator = new AllergyEvaluator();
  const policy = {
    allergyUnresolvedDrugDefault: ClinicalSafetyPolicyAction.WARN,
    allergyIngredientMatch: ClinicalSafetyPolicyAction.BLOCK,
    allergyTextFallback: ClinicalSafetyPolicyAction.WARN,
    interactionWhenUnavailable: InteractionWhenUnavailable.ALLOW_WITH_WARNING,
  };

  it('uses exact structured ingredient match with BLOCK policy severity', () => {
    const findings = evaluator.evaluate(
      ['Penicillin'],
      [
        {
          medicationName: 'Amoxicillin 500mg',
          clinicalDrugId: 'drug-1',
          drugResolutionStatus: DrugResolutionStatus.RESOLVED,
          ingredientNames: ['Penicillin'],
        },
      ],
      policy,
    );

    expect(findings.some((f) => f.findingType === PrescriptionSafetyFindingType.ALLERGY)).toBe(
      true,
    );
    const allergy = findings.find((f) => f.findingType === PrescriptionSafetyFindingType.ALLERGY);
    expect(allergy?.severity).toBe(PrescriptionSafetySeverity.BLOCK);
  });

  it('uses fallback substring match as WARNING by default', () => {
    const findings = evaluator.evaluate(
      ['penicillin'],
      [
        {
          medicationName: 'Penicillin V tablets',
          clinicalDrugId: null,
          drugResolutionStatus: DrugResolutionStatus.FREE_TEXT,
          ingredientNames: [],
        },
      ],
      policy,
    );

    const fallback = findings.find(
      (f) => f.findingType === PrescriptionSafetyFindingType.ALLERGY,
    );
    expect(fallback?.severity).toBe(PrescriptionSafetySeverity.WARNING);
  });
});
