import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { AbdmHeadersService } from './abdm-headers.service';
import { AbdmSessionService } from './abdm-session.service';
import { abdmFetch, parseAbdmJsonResponse } from './utils/abdm-http.util';

/**
 * Certificate response schema is not fully verified from Swagger.
 * Parsing is isolated here so it can be adjusted when official schema is available.
 */
function extractPublicKeyFromCertsResponse(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }

  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (typeof record.publicKey === 'string' && record.publicKey.trim()) {
    return record.publicKey.trim();
  }

  if (typeof record.certificate === 'string' && record.certificate.trim()) {
    return record.certificate.trim();
  }

  if (Array.isArray(body)) {
    for (const item of body) {
      const extracted = extractPublicKeyFromCertsResponse(item);
      if (extracted) {
        return extracted;
      }
    }
  }

  if (Array.isArray(record.keys)) {
    for (const item of record.keys) {
      const extracted = extractPublicKeyFromCertsResponse(item);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

@Injectable()
export class AbdmCertificateService {
  private cachedPublicKey: string | null = null;
  private cachedRawResponse: unknown = null;

  constructor(
    private readonly environmentService: AbdmEnvironmentService,
    private readonly sessionService: AbdmSessionService,
    private readonly headersService: AbdmHeadersService,
  ) {}

  clearCache(): void {
    this.cachedPublicKey = null;
    this.cachedRawResponse = null;
  }

  async getPublicKey(): Promise<string> {
    if (this.environmentService.isMockMode()) {
      return this.getMockPublicKey();
    }

    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }

    const accessToken = await this.sessionService.getAccessToken();
    const gatewayBaseUrl = this.environmentService.getGatewayBaseUrl();
    const url = `${gatewayBaseUrl}/api/hiecm/gateway/v3/certs`;

    let response: Response;

    try {
      response = await abdmFetch(
        url,
        {
          method: 'GET',
          headers: this.headersService.buildGatewayHeaders(accessToken),
        },
        this.environmentService.getRequestTimeoutMs(),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'Failed to retrieve ABDM gateway certificate',
      );
    }

    const body = await parseAbdmJsonResponse(response);

    if (response.status < 200 || response.status >= 300) {
      throw new BadRequestException('Failed to retrieve ABDM gateway certificate');
    }

    this.cachedRawResponse = body;
    const publicKey = extractPublicKeyFromCertsResponse(body);

    if (!publicKey) {
      throw new BadRequestException(
        'ABDM certificate response did not contain a recognizable public key',
      );
    }

    this.cachedPublicKey = publicKey;
    return publicKey;
  }

  getMockPublicKey(): string {
    return '-----BEGIN PUBLIC KEY-----\nMOCK_ABDM_PUBLIC_KEY\n-----END PUBLIC KEY-----';
  }

  getCachedRawResponse(): unknown {
    return this.cachedRawResponse;
  }
}
