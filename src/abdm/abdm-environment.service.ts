import { BadRequestException, Injectable } from '@nestjs/common';
import { AbdmEnvironment } from '@prisma/client';

export type AbdmEnvironmentInfo = {
  environment: AbdmEnvironment;
  mockMode: boolean;
  baseUrlConfigured: boolean;
  requestTimeoutMs: number;
};

export type AbdmClientCredentials = {
  clientId: string;
  clientSecret: string;
};

@Injectable()
export class AbdmEnvironmentService {
  private static readonly TOKEN_EXPIRY_BUFFER_MS = 60_000;

  getTokenExpiryBufferMs(): number {
    return AbdmEnvironmentService.TOKEN_EXPIRY_BUFFER_MS;
  }

  getEnvironment(): AbdmEnvironment {
    const raw = process.env.ABDM_ENV?.trim().toLowerCase();

    if (raw === 'production') {
      return AbdmEnvironment.PRODUCTION;
    }

    return AbdmEnvironment.SANDBOX;
  }

  isMockMode(): boolean {
    const raw = process.env.ABDM_MOCK_MODE?.trim().toLowerCase();
    if (raw === 'false') {
      return false;
    }
    if (raw === 'true') {
      return true;
    }
    // Unset: mock in sandbox (safe local default); production defaults to real mode (fail closed).
    return this.getEnvironment() !== AbdmEnvironment.PRODUCTION;
  }

  getCallbackSecret(): string | null {
    const value = process.env.ABDM_CALLBACK_SECRET?.trim();
    return value || null;
  }

  getGatewayBaseUrl(): string {
    return (
      process.env.ABDM_GATEWAY_BASE_URL?.trim() || 'https://dev.abdm.gov.in'
    );
  }

  /**
   * HIE-CM API path prefix. Documented ambiguity between /api/hiecm and /hiecm/api.
   * Default follows the verified M2 document: /api/hiecm
   */
  getHiecmApiBasePath(): string {
    const configured = process.env.ABDM_HIECM_API_BASE_PATH?.trim();
    return configured || '/api/hiecm';
  }

  getXCmId(): string {
    return process.env.ABDM_X_CM_ID?.trim() || 'sbx';
  }

  getAbhaBaseUrl(): string {
    return (
      process.env.ABDM_ABHA_BASE_URL?.trim() ||
      'https://abhasbx.abdm.gov.in/abha/api'
    );
  }

  getCallbackBaseUrl(): string | null {
    const value = process.env.ABDM_CALLBACK_BASE_URL?.trim();
    return value || null;
  }

  getDefaultHipId(): string | null {
    const value = process.env.ABDM_DEFAULT_HIP_ID?.trim();
    return value || null;
  }

  /**
   * Full URL for the documented HFR Search API (POST).
   * Request/response schema is documented in the sandbox integrator guide,
   * but the exact path was not verified from live Swagger — configure explicitly.
   */
  getHfrSearchUrl(): string | null {
    const value = process.env.ABDM_HFR_SEARCH_URL?.trim();
    return value || null;
  }

  getConsentManagerUrl(): string | null {
    const value = process.env.ABDM_CONSENT_MANAGER_URL?.trim();
    return value || null;
  }

  getBaseUrl(): string | null {
    const environment = this.getEnvironment();

    if (environment === AbdmEnvironment.PRODUCTION) {
      return process.env.ABDM_PRODUCTION_BASE_URL?.trim() || null;
    }

    return process.env.ABDM_SANDBOX_BASE_URL?.trim() || null;
  }

  getRequestTimeoutMs(): number {
    const raw = process.env.ABDM_REQUEST_TIMEOUT_MS?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : 30000;

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 30000;
    }

    return parsed;
  }

  getClientCredentials(): AbdmClientCredentials {
    const environment = this.getEnvironment();

    if (environment === AbdmEnvironment.PRODUCTION) {
      const clientId = process.env.ABDM_PRODUCTION_CLIENT_ID?.trim();
      const clientSecret = process.env.ABDM_PRODUCTION_CLIENT_SECRET?.trim();

      if (!clientId || !clientSecret) {
        throw new BadRequestException('ABDM production credentials are not configured');
      }

      return { clientId, clientSecret };
    }

    const clientId = process.env.ABDM_SANDBOX_CLIENT_ID?.trim();
    const clientSecret = process.env.ABDM_SANDBOX_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      throw new BadRequestException('ABDM sandbox credentials are not configured');
    }

    return { clientId, clientSecret };
  }

  getEnvironmentInfo(): AbdmEnvironmentInfo {
    const baseUrl = this.getBaseUrl();

    return {
      environment: this.getEnvironment(),
      mockMode: this.isMockMode(),
      baseUrlConfigured: Boolean(baseUrl),
      requestTimeoutMs: this.getRequestTimeoutMs(),
    };
  }
}
