import { InteractionAdapterStatus } from '@prisma/client';
import { SafetyFindingDraft } from '../safety/safety.types';

export type DrugInteractionCandidateLine = {
  medicationName: string;
  clinicalDrugId: string | null;
  ingredientNames: string[];
};

export type DrugInteractionCheckInput = {
  hospitalId: string;
  patientId: string;
  candidateLines: DrugInteractionCandidateLine[];
  activePrescriptionLines: DrugInteractionCandidateLine[];
};

export type DrugInteractionCheckResult = {
  status: InteractionAdapterStatus;
  findings: SafetyFindingDraft[];
};

export interface DrugInteractionAdapter {
  checkInteractions(
    input: DrugInteractionCheckInput,
  ): Promise<DrugInteractionCheckResult>;
}

export const DRUG_INTERACTION_ADAPTER = Symbol('DRUG_INTERACTION_ADAPTER');
