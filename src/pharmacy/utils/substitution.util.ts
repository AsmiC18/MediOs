import { BadRequestException } from '@nestjs/common';

export type DispensingSubstitutionInput = {
  productId: string;
  prescribedProductId?: string | null;
  substitutionReason?: string | null;
};

export function resolveSubstitutionFields(
  input: DispensingSubstitutionInput,
): {
  isSubstitution: boolean;
  prescribedProductId: string | null;
  substitutionReason: string | null;
} {
  const reason = input.substitutionReason?.trim() || null;
  const prescribedId = input.prescribedProductId?.trim() || null;

  if (prescribedId && prescribedId === input.productId && !reason) {
    return {
      isSubstitution: false,
      prescribedProductId: null,
      substitutionReason: null,
    };
  }

  if (prescribedId && prescribedId !== input.productId) {
    if (!reason) {
      throw new BadRequestException(
        'Substitution reason is required when dispensing a different product',
      );
    }
    return {
      isSubstitution: true,
      prescribedProductId: prescribedId,
      substitutionReason: reason,
    };
  }

  if (reason) {
    throw new BadRequestException(
      'prescribedProductId is required when providing a substitution reason',
    );
  }

  return {
    isSubstitution: false,
    prescribedProductId: null,
    substitutionReason: null,
  };
}
