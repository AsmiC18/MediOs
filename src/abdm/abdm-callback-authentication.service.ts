import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AbdmCertificateService } from './abdm-certificate.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import {
  extractBearerAuthorization,
  verifyAbdmCallbackJwt,
} from './utils/abdm-callback-jwt.util';

export type AbdmCallbackRequestHeaders = {
  authorization?: string | null;
};

@Injectable()
export class AbdmCallbackAuthenticationService {
  constructor(
    private readonly environmentService: AbdmEnvironmentService,
    private readonly certificateService: AbdmCertificateService,
  ) {}

  /**
   * Cryptographic callback authentication for real ABDM mode.
   * Mock mode skips verification (development/tests only).
   */
  async assertCallbackAuthenticated(
    headers: AbdmCallbackRequestHeaders,
  ): Promise<void> {
    if (this.environmentService.isMockMode()) {
      return;
    }

    const token = extractBearerAuthorization(headers.authorization);
    if (!token) {
      throw new UnauthorizedException(
        'ABDM callback missing Authorization bearer JWT',
      );
    }

    const publicKeyPem = await this.resolveVerificationPublicKey();
    verifyAbdmCallbackJwt(token, publicKeyPem, {
      algorithms: this.environmentService.getCallbackJwtAlgorithms(),
      issuer: this.environmentService.getCallbackJwtIssuer(),
      audience: this.environmentService.getCallbackJwtAudience(),
    });
  }

  private async resolveVerificationPublicKey(): Promise<string> {
    const configuredPem = this.environmentService.getCallbackJwtPublicKey();
    if (configuredPem) {
      return configuredPem;
    }

    if (this.environmentService.useGatewayCertsForCallbackJwt()) {
      try {
        return await this.certificateService.getPublicKey();
      } catch {
        throw new ServiceUnavailableException(
          'ABDM callback JWT verification key unavailable from gateway certificates',
        );
      }
    }

    throw new UnauthorizedException(
      'ABDM callback JWT verification is not configured',
    );
  }
}
