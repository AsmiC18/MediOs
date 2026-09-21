import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import Razorpay from 'razorpay';
import { roundMoney, toDecimal } from './utils/money.util';

export type CreatePaymentLinkInput = {
  paymentId: string;
  invoiceNumber: string;
  amount: string | number;
  currency: string;
};

export type CreatePaymentLinkResult = {
  providerPaymentLinkId: string;
  paymentLinkUrl: string;
};

export type CreateRefundInput = {
  refundId: string;
  providerPaymentId: string;
  amount: string | number;
  currency: string;
  reason?: string;
};

export type CreateRefundResult = {
  providerRefundId: string;
};

@Injectable()
export class RazorpayService {
  private createClient(): Razorpay {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new BadRequestException('Razorpay is not configured');
    }

    return new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  async createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    if (process.env.RAZORPAY_MOCK_MODE === 'true') {
      return {
        providerPaymentLinkId: `plink_mock_${input.paymentId.replace(/-/g, '').slice(0, 14)}`,
        paymentLinkUrl: `https://rzp.io/i/mock-${input.paymentId.slice(0, 8)}`,
      };
    }

    const amountDecimal = roundMoney(toDecimal(input.amount));
    const amountPaise = amountDecimal.mul(100).toDecimalPlaces(0).toNumber();

    if (amountPaise <= 0) {
      throw new BadRequestException('Invoice amount must be greater than zero');
    }

    const client = this.createClient();

    try {
      const paymentLink = (await client.paymentLink.create({
        amount: amountPaise,
        currency: input.currency,
        description: `MediOS invoice ${input.invoiceNumber}`,
        reference_id: input.paymentId,
        notify: {
          sms: false,
          email: false,
        },
      } as Parameters<Razorpay['paymentLink']['create']>[0])) as {
        id: string;
        short_url: string;
      };

      const providerPaymentLinkId = paymentLink.id;
      const paymentLinkUrl = paymentLink.short_url;

      if (!providerPaymentLinkId || !paymentLinkUrl) {
        throw new InternalServerErrorException(
          'Razorpay payment link response was incomplete',
        );
      }

      return {
        providerPaymentLinkId,
        paymentLinkUrl,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to create Razorpay payment link',
      );
    }
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    if (process.env.RAZORPAY_MOCK_MODE === 'true') {
      if (input.reason === 'MOCK_REFUND_FAIL') {
        throw new InternalServerErrorException('Mock Razorpay refund failure');
      }

      return {
        providerRefundId: `rfnd_mock_${input.refundId.replace(/-/g, '').slice(0, 14)}`,
      };
    }

    const amountDecimal = roundMoney(toDecimal(input.amount));
    const amountPaise = amountDecimal.mul(100).toDecimalPlaces(0).toNumber();

    if (amountPaise <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    const client = this.createClient();

    try {
      const refund = (await client.payments.refund(input.providerPaymentId, {
        amount: amountPaise,
        notes: input.reason
          ? {
              reason: input.reason.slice(0, 256),
            }
          : undefined,
      })) as { id: string };

      if (!refund.id) {
        throw new InternalServerErrorException(
          'Razorpay refund response was incomplete',
        );
      }

      return {
        providerRefundId: refund.id,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to create Razorpay refund');
    }
  }
}
