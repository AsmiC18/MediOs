import { Injectable } from '@nestjs/common';
import {
  InsurancePayerAdapter,
  InsurancePayerSubmitResult,
} from './insurance-payer.adapter';

@Injectable()
export class ManualInsurancePayerAdapter implements InsurancePayerAdapter {
  async submitClaim(input: {
    hospitalId: string;
    claimId: string;
    claimNumber: string;
  }): Promise<InsurancePayerSubmitResult> {
    void input;
    return {
      outcome: 'MANUAL_REQUIRED',
      message:
        'No external insurer/TPA adapter configured; manual submission is required.',
    };
  }
}
