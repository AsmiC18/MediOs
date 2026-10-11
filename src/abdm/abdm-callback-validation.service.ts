import { BadRequestException, Injectable } from '@nestjs/common';
import {
  parseLinkTokenCallbackBody,
  ParsedLinkTokenCallback,
} from './utils/link-token-response.util';

/**
 * Callback JWT validation details are only partially documented.
 * Validation is isolated here so it can be extended when Swagger is confirmed.
 */
export type ValidatedLinkTokenCallback = ParsedLinkTokenCallback & {
  requestId: string;
  linkToken: string;
};

@Injectable()
export class AbdmCallbackValidationService {
  validateGenerateTokenCallback(body: unknown): ValidatedLinkTokenCallback {
    const parsed = parseLinkTokenCallbackBody(body);

    if (!parsed.requestId) {
      throw new BadRequestException('Callback missing response.requestId');
    }

    if (!parsed.linkToken) {
      throw new BadRequestException('Callback missing linkToken');
    }

    return parsed as ValidatedLinkTokenCallback;
  }
}
