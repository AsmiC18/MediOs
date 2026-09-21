import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WhatsAppService } from './whatsapp.service';

@Controller('webhooks')
export class WhatsAppWebhookController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Get('whatsapp')
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const verifiedChallenge = this.whatsAppService.verifyWebhook(
        mode,
        verifyToken,
        challenge,
      );

      if (res) {
        res.type('text/plain');
      }

      return verifiedChallenge;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      throw new ForbiddenException('Invalid WhatsApp webhook verification');
    }
  }

  @Post('whatsapp')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new UnauthorizedException('Missing raw webhook body');
    }

    return this.whatsAppService.handleWebhook(rawBody, signature);
  }
}
