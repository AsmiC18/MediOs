import {
  ClinicalSafetyPolicyAction,
  DrugResolutionStatus,
  InteractionAdapterStatus,
  InteractionWhenUnavailable,
  PrescriptionSafetyFindingSource,
  PrescriptionSafetyFindingType,
  PrescriptionSafetySeverity,
} from '@prisma/client';

export type ResolvedPrescriptionLine = {
  medicationName: string;
  clinicalDrugId: string | null;
  drugResolutionStatus: DrugResolutionStatus;
  genericName?: string | null;
  brandName?: string | null;
  ingredientNames: string[];
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  quantity?: number;
};

export type SafetyFindingDraft = {
  findingKey: string;
  findingType: PrescriptionSafetyFindingType;
  severity: PrescriptionSafetySeverity;
  summary: string;
  detailJson?: Record<string, unknown>;
  source: PrescriptionSafetyFindingSource;
  overridden?: boolean;
  overrideReason?: string;
  overrideAt?: Date;
};

export type HospitalSafetyPolicyView = {
  allergyUnresolvedDrugDefault: ClinicalSafetyPolicyAction;
  allergyIngredientMatch: ClinicalSafetyPolicyAction;
  allergyTextFallback: ClinicalSafetyPolicyAction;
  interactionWhenUnavailable: InteractionWhenUnavailable;
};

export type PrescriptionSafetyEvaluationResult = {
  resolvedLines: ResolvedPrescriptionLine[];
  findings: SafetyFindingDraft[];
  interactionAdapterStatus: InteractionAdapterStatus;
  interactionCheckAvailable: boolean;
  patientUpdatedAt: Date;
  blockingFindingKeys: string[];
};

export type SafetyOverrideInput = {
  findingKeys: string[];
  reason: string;
};
