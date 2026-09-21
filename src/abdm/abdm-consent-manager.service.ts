import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AbdmEnvironmentService } from './abdm-environment.service';

export type ConsentManagerRequestInput = {
  patientId: string;
  purpose: string;
};

export type ConsentManagerRequestResult = {
  consentRequestId: string;
  mock?: boolean;
};

export type ConsentManagerStatusResult = {
  status: string;
  mock?: boolean;
};

@Injectable()
export class AbdmConsentManagerService {
  constructor(private readonly environmentService: AbdmEnvironmentService) {}

  async createConsentRequest(
    input: ConsentManagerRequestInput,
  ): Promise<ConsentManagerRequestResult> {
    if (this.environmentService.isMockMode()) {
      return {
        consentRequestId: `consent_mock_${input.patientId.replace(/-/g, '').slice(0, 12)}_${randomUUID().slice(0, 8)}`,
        mock: true,
      };
    }

    const managerUrl = this.environmentService.getConsentManagerUrl();

    if (!managerUrl) {
      throw new ServiceUnavailableException(
        'ABDM Consent Manager integration is not available: ABDM_CONSENT_MANAGER_URL is not configured. ' +
          'Official consent manager API paths and schemas are not verified in this codebase.',
      );
    }

    throw new ServiceUnavailableException(
      'ABDM Consent Manager real-mode adapter is not implemented until official endpoints are verified.',
    );
  }

  async fetchConsentStatus(
    _consentRequestId: string,
  ): Promise<ConsentManagerStatusResult> {
    if (this.environmentService.isMockMode()) {
      return {
        status: 'GRANTED',
        mock: true,
      };
    }

    throw new ServiceUnavailableException(
      'ABDM Consent Manager status fetch is not available until official endpoints are verified.',
    );
  }

  async revokeConsent(_consentRequestId: string): Promise<{ revoked: boolean; mock?: boolean }> {
    if (this.environmentService.isMockMode()) {
      return { revoked: true, mock: true };
    }

    throw new ServiceUnavailableException(
      'ABDM Consent Manager revoke is not available until official endpoints are verified.',
    );
  }
}
