import {
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';

@Controller('webhooks')
export class RazorpayWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('razorpay')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new UnauthorizedException('Missing raw webhook body');
    }

    return this.paymentsService.handleRazorpayWebhook(rawBody, signature);
  }
}
