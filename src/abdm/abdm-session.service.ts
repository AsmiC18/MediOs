import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { abdmFetch, parseAbdmJsonResponse } from './utils/abdm-http.util';

type SessionCache = {
  accessToken: string;
  expiresAtMs: number;
};

type SessionResponse = {
  accessToken?: unknown;
  expiresIn?: unknown;
  refreshExpiresIn?: unknown;
  refreshToken?: unknown;
  tokenType?: unknown;
};

@Injectable()
export class AbdmSessionService {
  private cache: SessionCache | null = null;

  constructor(private readonly environmentService: AbdmEnvironmentService) {}

  clearCache(): void {
    this.cache = null;
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    const bufferMs = this.environmentService.getTokenExpiryBufferMs();

    if (this.cache && now < this.cache.expiresAtMs - bufferMs) {
      return this.cache.accessToken;
    }

    if (this.environmentService.isMockMode()) {
      this.cache = {
        accessToken: this.getMockAccessToken(),
        expiresAtMs: Date.now() + 1200 * 1000,
      };
      return this.cache.accessToken;
    }

    const credentials = this.environmentService.getClientCredentials();
    const gatewayBaseUrl = this.environmentService.getGatewayBaseUrl();
    const url = `${gatewayBaseUrl}/api/hiecm/gateway/v3/sessions`;

    let response: Response;

    try {
      response = await abdmFetch(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'REQUEST-ID': randomUUID(),
            TIMESTAMP: new Date().toISOString(),
            'X-CM-ID': this.environmentService.getXCmId(),
          },
          body: JSON.stringify({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            grantType: 'client_credentials',
          }),
        },
        this.environmentService.getRequestTimeoutMs(),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to obtain ABDM session token',
      );
    }

    const body = (await parseAbdmJsonResponse(response)) as SessionResponse;

    if (response.status < 200 || response.status >= 300) {
      throw new BadRequestException('Failed to obtain ABDM session token');
    }

    if (typeof body?.accessToken !== 'string' || !body.accessToken) {
      throw new BadRequestException('ABDM session response missing accessToken');
    }

    const expiresInSeconds =
      typeof body.expiresIn === 'number' && body.expiresIn > 0
        ? body.expiresIn
        : 1200;

    this.cache = {
      accessToken: body.accessToken,
      expiresAtMs: Date.now() + expiresInSeconds * 1000,
    };

    return this.cache.accessToken;
  }

  getMockAccessToken(): string {
    return 'mock_abdm_access_token';
  }

  getCacheExpiresAtMs(): number | null {
    return this.cache?.expiresAtMs ?? null;
  }
}
