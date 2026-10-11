import { BadRequestException } from '@nestjs/common';

export type FormularyDispenseValidationInput = {
  formularyEntryActive: boolean;
  defaultPharmacyProductId: string | null;
  dispensedProductId: string;
  prescribedProductId: string | null;
  substitutionReason: string | null;
  isSubstitution: boolean;
};

/**
 * Hospital formulary default product rules (no external therapeutic equivalence).
 * When a line is tied to a formulary clinical drug, dispensing a product other than
 * the configured default requires an authorized substitution with reason.
 */
export function validateFormularyDispenseLine(
  input: FormularyDispenseValidationInput,
): void {
  if (!input.formularyEntryActive) {
    throw new BadRequestException(
      'Prescription drug is not on the active hospital formulary',
    );
  }

  const defaultId = input.defaultPharmacyProductId;
  if (!defaultId) {
    return;
  }

  if (input.dispensedProductId === defaultId) {
    return;
  }

  if (!input.isSubstitution) {
    throw new BadRequestException(
      'Dispensed product differs from formulary default; record an authorized substitution',
    );
  }

  if (input.prescribedProductId !== defaultId) {
    throw new BadRequestException(
      'Substitution must reference the formulary default product as prescribed product',
    );
  }

  if (!input.substitutionReason) {
    throw new BadRequestException(
      'Substitution reason is required for non-default formulary dispensing',
    );
  }
}
