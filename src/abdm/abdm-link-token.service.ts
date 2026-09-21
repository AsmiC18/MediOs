import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { AbdmHeadersService } from './abdm-headers.service';
import { AbdmSessionService } from './abdm-session.service';
import { abdmFetch, parseAbdmJsonResponse } from './utils/abdm-http.util';
import { PatientDemographics } from './utils/patient-demographics.util';

export type DemographicLinkTokenRequest = {
  abhaNumber?: string;
  abhaAddress?: string;
  demographics: PatientDemographics;
  hipId: string;
};

export type DemographicLinkTokenResult = {
  requestId: string;
  transactionId?: string;
  rawResponse: unknown;
};

function extractRequestId(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (typeof record.requestId === 'string' && record.requestId) {
    return record.requestId;
  }

  if (record.response && typeof record.response === 'object') {
    const response = record.response as Record<string, unknown>;
    if (typeof response.requestId === 'string' && response.requestId) {
      return response.requestId;
    }
  }

  return null;
}

function extractTransactionId(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (typeof record.txnId === 'string' && record.txnId) {
    return record.txnId;
  }

  if (typeof record.transactionId === 'string' && record.transactionId) {
    return record.transactionId;
  }

  return null;
}

@Injectable()
export class AbdmLinkTokenService {
  constructor(
    private readonly environmentService: AbdmEnvironmentService,
    private readonly sessionService: AbdmSessionService,
    private readonly headersService: AbdmHeadersService,
  ) {}

  async requestDemographicLinkToken(
    request: DemographicLinkTokenRequest,
  ): Promise<DemographicLinkTokenResult> {
    if (!request.abhaNumber && !request.abhaAddress) {
      throw new BadRequestException('Either abhaNumber or abhaAddress is required');
    }

    if (this.environmentService.isMockMode()) {
      return this.getMockLinkTokenResult(request);
    }

    const accessToken = await this.sessionService.getAccessToken();
    const gatewayBaseUrl = this.environmentService.getGatewayBaseUrl();
    const hiecmBasePath = this.environmentService.getHiecmApiBasePath();

    /**
     * Path prefix ambiguity between /api/hiecm and /hiecm/api is documented in research.
     * Use ABDM_HIECM_API_BASE_PATH to adjust without code changes.
     */
    const url = `${gatewayBaseUrl}${hiecmBasePath}/v3/token/generate-token`;

    const payload: Record<string, unknown> = {
      name: request.demographics.name,
      gender: request.demographics.gender,
      yearOfBirth: request.demographics.yearOfBirth,
    };

    if (request.abhaNumber) {
      payload.abhaNumber = request.abhaNumber;
    }

    if (request.abhaAddress) {
      payload.abhaAddress = request.abhaAddress;
    }

    let response: Response;

    try {
      response = await abdmFetch(
        url,
        {
          method: 'POST',
          headers: this.headersService.buildGatewayHeaders(accessToken, {
            hipId: request.hipId,
          }),
          body: JSON.stringify(payload),
        },
        this.environmentService.getRequestTimeoutMs(),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'Failed to request ABDM demographic link token',
      );
    }

    const body = await parseAbdmJsonResponse(response);

    if (response.status < 200 || response.status >= 300) {
      throw new BadRequestException('Failed to request ABDM demographic link token');
    }

    const requestId = extractRequestId(body);

    if (!requestId) {
      throw new BadRequestException(
        'ABDM link-token response missing requestId correlation field',
      );
    }

    return {
      requestId,
      transactionId: extractTransactionId(body) ?? undefined,
      rawResponse: body,
    };
  }

  private getMockLinkTokenResult(
    request: DemographicLinkTokenRequest,
  ): DemographicLinkTokenResult {
    const identifier = request.abhaNumber ?? request.abhaAddress ?? 'unknown';
    const requestId = `mock-abdm-request-${identifier}`;

    return {
      requestId,
      transactionId: `mock-abdm-txn-${identifier}`,
      rawResponse: {
        mock: true,
        requestId,
        message: 'Mock demographic link-token request accepted',
      },
    };
  }
}
