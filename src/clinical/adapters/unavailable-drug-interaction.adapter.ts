import { Injectable } from '@nestjs/common';
import { InteractionAdapterStatus } from '@prisma/client';
import {
  DrugInteractionAdapter,
  DrugInteractionCheckInput,
  DrugInteractionCheckResult,
} from './drug-interaction.adapter';

@Injectable()
export class UnavailableDrugInteractionAdapter implements DrugInteractionAdapter {
  async checkInteractions(
    _input: DrugInteractionCheckInput,
  ): Promise<DrugInteractionCheckResult> {
    return {
      status: InteractionAdapterStatus.UNAVAILABLE,
      findings: [],
    };
  }
}
