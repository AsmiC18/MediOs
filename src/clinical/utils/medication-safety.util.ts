export type AllergyWarning = {
  medicationName: string;
  allergy: string;
  message: string;
};

/**
 * Checks prescription items against documented patient allergies.
 * This is a string-match helper only — not a verified drug interaction engine.
 */
export function checkDocumentedAllergies(
  allergies: string[],
  medicationNames: string[],
): AllergyWarning[] {
  const warnings: AllergyWarning[] = [];
  const normalizedAllergies = allergies
    .map((allergy) => allergy.trim().toLowerCase())
    .filter(Boolean);

  if (normalizedAllergies.length === 0) {
    return warnings;
  }

  for (const medicationName of medicationNames) {
    const normalizedMedication = medicationName.trim().toLowerCase();

    for (const allergy of normalizedAllergies) {
      if (
        normalizedMedication.includes(allergy) ||
        allergy.includes(normalizedMedication)
      ) {
        warnings.push({
          medicationName,
          allergy,
          message:
            'Medication name overlaps a documented patient allergy. Verify manually; no automated interaction database is configured.',
        });
      }
    }
  }

  return warnings;
}
