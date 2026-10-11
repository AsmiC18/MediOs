import { Injectable } from '@nestjs/common';
import {
  DiagnosticLabAggregatorAdapter,
  DiagnosticLabAggregatorSubmitInput,
  DiagnosticLabAggregatorSubmitResult,
} from './diagnostic-lab-aggregator.adapter';

@Injectable()
export class ManualDiagnosticLabAggregatorAdapter
  implements DiagnosticLabAggregatorAdapter
{
  async submitOrder(
    input: DiagnosticLabAggregatorSubmitInput,
  ): Promise<DiagnosticLabAggregatorSubmitResult> {
    void input;
    return {
      outcome: 'MANUAL_REQUIRED',
      message:
        'No external lab aggregator adapter configured; manual lab submission is required.',
    };
  }
}
