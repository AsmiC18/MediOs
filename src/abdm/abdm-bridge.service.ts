import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { AbdmHeadersService } from './abdm-headers.service';
import { AbdmSessionService } from './abdm-session.service';
import { abdmFetch, parseAbdmJsonResponse } from './utils/abdm-http.util';

@Injectable()
export class AbdmBridgeService {
  constructor(
    private readonly environmentService: AbdmEnvironmentService,
    private readonly sessionService: AbdmSessionService,
    private readonly headersService: AbdmHeadersService,
  ) {}

  async updateBridgeUrl(callbackUrl: string): Promise<unknown> {
    if (this.environmentService.isMockMode()) {
      return {
        mock: true,
        url: callbackUrl,
        message: 'Mock bridge URL registered',
      };
    }

    const accessToken = await this.sessionService.getAccessToken();
    const gatewayBaseUrl = this.environmentService.getGatewayBaseUrl();
    const url = `${gatewayBaseUrl}/api/hiecm/gateway/v3/bridge/url`;

    let response: Response;

    try {
      response = await abdmFetch(
        url,
        {
          method: 'PATCH',
          headers: this.headersService.buildGatewayHeaders(accessToken),
          body: JSON.stringify({ url: callbackUrl }),
        },
        this.environmentService.getRequestTimeoutMs(),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to update ABDM bridge URL',
      );
    }

    const body = await parseAbdmJsonResponse(response);

    if (response.status < 200 || response.status >= 300) {
      throw new BadRequestException('Failed to update ABDM bridge URL');
    }

    return body;
  }

  async listBridgeServices(): Promise<unknown> {
    if (this.environmentService.isMockMode()) {
      return {
        mock: true,
        services: [],
      };
    }

    const accessToken = await this.sessionService.getAccessToken();
    const gatewayBaseUrl = this.environmentService.getGatewayBaseUrl();
    const url = `${gatewayBaseUrl}/api/hiecm/gateway/v3/bridge-services`;

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
          : 'Failed to retrieve ABDM bridge services',
      );
    }

    const body = await parseAbdmJsonResponse(response);

    if (response.status < 200 || response.status >= 300) {
      throw new BadRequestException('Failed to retrieve ABDM bridge services');
    }

    return body;
  }
}
