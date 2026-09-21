import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AbdmEnvironmentService } from './abdm-environment.service';

export type AbdmGatewayHeaders = Record<string, string>;

@Injectable()
export class AbdmHeadersService {
  constructor(private readonly environmentService: AbdmEnvironmentService) {}

  buildGatewayHeaders(
    accessToken: string,
    options: { hipId?: string | null } = {},
  ): AbdmGatewayHeaders {
    const headers: AbdmGatewayHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'REQUEST-ID': randomUUID(),
      TIMESTAMP: new Date().toISOString(),
      'X-CM-ID': this.environmentService.getXCmId(),
      'Content-Type': 'application/json',
    };

    if (options.hipId) {
      headers['X-HIP-ID'] = options.hipId;
    }

    return headers;
  }
}
