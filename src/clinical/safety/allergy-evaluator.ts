import {
  ClinicalSafetyPolicyAction,
  DrugResolutionStatus,
  PrescriptionSafetyFindingSource,
  PrescriptionSafetyFindingType,
  PrescriptionSafetySeverity,
} from '@prisma/client';
import { checkDocumentedAllergies } from '../utils/medication-safety.util';
import { buildFindingKey } from './finding-key.util';
import {
  HospitalSafetyPolicyView,
  ResolvedPrescriptionLine,
  SafetyFindingDraft,
} from './safety.types';

function severityForPolicy(
  action: ClinicalSafetyPolicyAction,
): PrescriptionSafetySeverity {
  return action === ClinicalSafetyPolicyAction.BLOCK
    ? PrescriptionSafetySeverity.BLOCK
    : PrescriptionSafetySeverity.WARNING;
}

export class AllergyEvaluator {
  evaluate(
    patientAllergies: string[],
    lines: ResolvedPrescriptionLine[],
    policy: HospitalSafetyPolicyView,
  ): SafetyFindingDraft[] {
    const findings: SafetyFindingDraft[] = [];

    for (const line of lines) {
      if (line.drugResolutionStatus === DrugResolutionStatus.UNRESOLVED) {
        findings.push({
          findingKey: buildFindingKey(
            PrescriptionSafetyFindingType.UNRESOLVED_DRUG,
            line.medicationName,
            line.clinicalDrugId,
          ),
          findingType: PrescriptionSafetyFindingType.UNRESOLVED_DRUG,
          severity: severityForPolicy(policy.allergyUnresolvedDrugDefault),
          summary: 'Prescription line could not be resolved to a formulary drug',
          detailJson: {
            medicationName: line.medicationName,
            clinicalDrugId: line.clinicalDrugId,
          },
          source: PrescriptionSafetyFindingSource.RULES,
        });
      }

      const exactNames: string[] = [];
      if (line.genericName?.trim()) {
        exactNames.push(line.genericName.trim());
      }
      if (line.brandName?.trim()) {
        exactNames.push(line.brandName.trim());
      }
      for (const ingredient of line.ingredientNames) {
        if (ingredient.trim()) {
          exactNames.push(ingredient.trim());
        }
      }

      const normalizedAllergies = patientAllergies
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

      for (const name of exactNames) {
        const normalizedName = name.toLowerCase();
        for (const allergy of normalizedAllergies) {
          if (normalizedName === allergy) {
            findings.push({
              findingKey: buildFindingKey(
                PrescriptionSafetyFindingType.ALLERGY,
                'EXACT_STRUCTURED',
                line.medicationName,
                name,
                allergy,
              ),
              findingType: PrescriptionSafetyFindingType.ALLERGY,
              severity: severityForPolicy(policy.allergyIngredientMatch),
              summary: 'Documented patient allergy matches structured medication identity',
              detailJson: {
                medicationName: line.medicationName,
                clinicalDrugId: line.clinicalDrugId,
                matchedTerm: name,
                matchKind: 'EXACT_STRUCTURED',
              },
              source: PrescriptionSafetyFindingSource.RULES,
            });
          }
        }
      }
    }

    const fallbackWarnings = checkDocumentedAllergies(
      patientAllergies,
      lines.map((line) => line.medicationName),
    );

    for (const warning of fallbackWarnings) {
      const alreadyStructured = findings.some(
        (f) =>
          f.findingType === PrescriptionSafetyFindingType.ALLERGY &&
          f.detailJson &&
          (f.detailJson as { medicationName?: string }).medicationName ===
            warning.medicationName,
      );
      if (alreadyStructured) {
        continue;
      }

      findings.push({
        findingKey: buildFindingKey(
          PrescriptionSafetyFindingType.ALLERGY,
          'FALLBACK_TEXT',
          warning.medicationName,
          warning.allergy,
        ),
        findingType: PrescriptionSafetyFindingType.ALLERGY,
        severity: severityForPolicy(policy.allergyTextFallback),
        summary: warning.message,
        detailJson: {
          medicationName: warning.medicationName,
          allergy: warning.allergy,
          matchKind: 'FALLBACK_TEXT',
        },
        source: PrescriptionSafetyFindingSource.FALLBACK_TEXT,
      });
    }

    return findings;
  }
}
