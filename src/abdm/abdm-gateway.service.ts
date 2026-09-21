import { BadRequestException, Injectable } from '@nestjs/common';
import { AbdmEnvironmentService } from './abdm-environment.service';

export type MockAbhaVerifyResult = {
  verified: boolean;
};

@Injectable()
export class AbdmGatewayService {
  constructor(private readonly environmentService: AbdmEnvironmentService) {}

  private assertMockModeAvailable(): void {
    if (this.environmentService.isMockMode()) {
      return;
    }

    throw new BadRequestException('ABDM integration not configured');
  }

  async verifyAbha(input: { patientId: string }): Promise<MockAbhaVerifyResult> {
    this.assertMockModeAvailable();

    return {
      verified: true,
    };
  }
}
