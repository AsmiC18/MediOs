import { Injectable } from '@nestjs/common';
import {
  ClinicalSafetyPolicyAction,
  InteractionWhenUnavailable,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HospitalSafetyPolicyView } from './safety.types';

@Injectable()
export class ClinicalSafetyPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getPolicyForHospital(hospitalId: string): Promise<HospitalSafetyPolicyView> {
    const existing = await this.prisma.hospitalClinicalSafetyPolicy.findUnique({
      where: { hospitalId },
    });

    if (existing) {
      return {
        allergyUnresolvedDrugDefault: existing.allergyUnresolvedDrugDefault,
        allergyIngredientMatch: existing.allergyIngredientMatch,
        allergyTextFallback: existing.allergyTextFallback,
        interactionWhenUnavailable: existing.interactionWhenUnavailable,
      };
    }

    return {
      allergyUnresolvedDrugDefault: ClinicalSafetyPolicyAction.WARN,
      allergyIngredientMatch: ClinicalSafetyPolicyAction.WARN,
      allergyTextFallback: ClinicalSafetyPolicyAction.WARN,
      interactionWhenUnavailable: InteractionWhenUnavailable.ALLOW_WITH_WARNING,
    };
  }

  async upsertPolicyForHospital(
    hospitalId: string,
    input: Partial<HospitalSafetyPolicyView>,
  ): Promise<HospitalSafetyPolicyView> {
    const updated = await this.prisma.hospitalClinicalSafetyPolicy.upsert({
      where: { hospitalId },
      create: {
        hospitalId,
        allergyUnresolvedDrugDefault:
          input.allergyUnresolvedDrugDefault ??
          ClinicalSafetyPolicyAction.WARN,
        allergyIngredientMatch:
          input.allergyIngredientMatch ?? ClinicalSafetyPolicyAction.WARN,
        allergyTextFallback:
          input.allergyTextFallback ?? ClinicalSafetyPolicyAction.WARN,
        interactionWhenUnavailable:
          input.interactionWhenUnavailable ??
          InteractionWhenUnavailable.ALLOW_WITH_WARNING,
      },
      update: {
        ...(input.allergyUnresolvedDrugDefault !== undefined && {
          allergyUnresolvedDrugDefault: input.allergyUnresolvedDrugDefault,
        }),
        ...(input.allergyIngredientMatch !== undefined && {
          allergyIngredientMatch: input.allergyIngredientMatch,
        }),
        ...(input.allergyTextFallback !== undefined && {
          allergyTextFallback: input.allergyTextFallback,
        }),
        ...(input.interactionWhenUnavailable !== undefined && {
          interactionWhenUnavailable: input.interactionWhenUnavailable,
        }),
      },
    });

    return {
      allergyUnresolvedDrugDefault: updated.allergyUnresolvedDrugDefault,
      allergyIngredientMatch: updated.allergyIngredientMatch,
      allergyTextFallback: updated.allergyTextFallback,
      interactionWhenUnavailable: updated.interactionWhenUnavailable,
    };
  }
}
