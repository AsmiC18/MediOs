import { BadRequestException, Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';
import {
  mapProviderError,
  mapReadProviderError,
  RazorpayError,
  RazorpayReadError,
} from './razorpay.errors';
import { roundMoney, toDecimal } from './utils/money.util';

export type CreatePaymentLinkInput = {
  paymentId: string;
  invoiceNumber: string;
  amount: string | number;
  currency: string;
  mockFail?: 'permanent' | 'ambiguous';
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
  mockFail?: 'permanent' | 'ambiguous';
};

export type CreateRefundResult = {
  providerRefundId: string;
};

export type PaymentLinkEntity = {
  id: string;
  short_url?: string;
  reference_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
};

export type PaymentEntity = {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  order_id?: string;
  captured?: boolean;
};

export type RefundEntity = {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  payment_id?: string;
};

@Injectable()
export class RazorpayService {
  private getRequestTimeoutMs(): number {
    const configured = Number(process.env.RAZORPAY_HTTP_TIMEOUT_MS ?? 30_000);
    return Number.isFinite(configured) && configured > 0 ? configured : 30_000;
  }

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

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    const timeoutMs = this.getRequestTimeoutMs();
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          const timer = setTimeout(() => {
            const error = new Error('Razorpay API request timed out');
            error.name = 'TimeoutError';
            reject(error);
          }, timeoutMs);
          operation.finally(() => clearTimeout(timer)).catch(() => undefined);
        }),
      ]);
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  private async withReadTimeout<T>(operation: Promise<T>): Promise<T> {
    const timeoutMs = this.getRequestTimeoutMs();
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          const timer = setTimeout(() => {
            const error = new Error('Razorpay API request timed out');
            error.name = 'TimeoutError';
            reject(error);
          }, timeoutMs);
          operation.finally(() => clearTimeout(timer)).catch(() => undefined);
        }),
      ]);
    } catch (error) {
      throw mapReadProviderError(error);
    }
  }

  async createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    if (process.env.RAZORPAY_MOCK_MODE === 'true') {
      if (input.mockFail === 'permanent') {
        throw new RazorpayError('permanent', 'Mock Razorpay payment link rejection');
      }
      if (input.mockFail === 'ambiguous') {
        throw new RazorpayError('ambiguous', 'Mock Razorpay payment link uncertain failure');
      }

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
      const paymentLink = await this.withTimeout(
        client.paymentLink.create({
          amount: amountPaise,
          currency: input.currency,
          description: `MediOS invoice ${input.invoiceNumber}`,
          reference_id: input.paymentId,
          notify: {
            sms: false,
            email: false,
          },
        } as Parameters<Razorpay['paymentLink']['create']>[0]) as Promise<{
          id: string;
          short_url: string;
        }>,
      );

      const providerPaymentLinkId = paymentLink.id;
      const paymentLinkUrl = paymentLink.short_url;

      if (!providerPaymentLinkId || !paymentLinkUrl) {
        throw new RazorpayError(
          'ambiguous',
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
      if (error instanceof RazorpayError) {
        throw error;
      }
      throw mapProviderError(error);
    }
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    if (process.env.RAZORPAY_MOCK_MODE === 'true') {
      if (input.mockFail === 'permanent' || input.reason === 'MOCK_REFUND_FAIL') {
        throw new RazorpayError('permanent', 'Mock Razorpay refund rejection');
      }
      if (input.mockFail === 'ambiguous') {
        throw new RazorpayError('ambiguous', 'Mock Razorpay refund uncertain failure');
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
      const refund = await this.withTimeout(
        client.payments.refund(input.providerPaymentId, {
          amount: amountPaise,
          notes: input.reason
            ? {
                reason: input.reason.slice(0, 256),
              }
            : undefined,
        }) as Promise<{ id: string }>,
      );

      if (!refund.id) {
        throw new RazorpayError(
          'ambiguous',
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
      if (error instanceof RazorpayError) {
        throw error;
      }
      throw mapProviderError(error);
    }
  }

  async fetchPaymentLink(paymentLinkId: string): Promise<PaymentLinkEntity> {
    if (process.env.RAZORPAY_MOCK_MODE === 'true') {
      return {
        id: paymentLinkId,
        status: 'created',
      };
    }

    const client = this.createClient();
    try {
      return await this.withReadTimeout(
        client.paymentLink.fetch(paymentLinkId) as Promise<PaymentLinkEntity>,
      );
    } catch (error) {
      if (error instanceof RazorpayReadError) {
        throw error;
      }
      throw mapReadProviderError(error);
    }
  }

  async fetchPayment(paymentId: string): Promise<PaymentEntity> {
    if (process.env.RAZORPAY_MOCK_MODE === 'true') {
      return { id: paymentId, status: 'captured', captured: true };
    }

    const client = this.createClient();
    try {
      return await this.withReadTimeout(
        client.payments.fetch(paymentId) as Promise<PaymentEntity>,
      );
    } catch (error) {
      if (error instanceof RazorpayReadError) {
        throw error;
      }
      throw mapReadProviderError(error);
    }
  }

  async fetchRefund(
    providerPaymentId: string,
    providerRefundId: string,
  ): Promise<RefundEntity> {
    if (process.env.RAZORPAY_MOCK_MODE === 'true') {
      return {
        id: providerRefundId,
        payment_id: providerPaymentId,
        status: 'processed',
      };
    }

    const client = this.createClient();
    try {
      return await this.withReadTimeout(
        client.payments.fetchRefund(
          providerPaymentId,
          providerRefundId,
        ) as Promise<RefundEntity>,
      );
    } catch (error) {
      if (error instanceof RazorpayReadError) {
        throw error;
      }
      throw mapReadProviderError(error);
    }
  }

  async listPaymentLinksByReferenceId(
    referenceId: string,
  ): Promise<PaymentLinkEntity[]> {
    if (process.env.RAZORPAY_MOCK_MODE === 'true') {
      return [];
    }

    const client = this.createClient();
    try {
      const response = await this.withReadTimeout(
        (
          client.paymentLink.all as (params: {
            reference_id: string;
            count: number;
          }) => Promise<{ items?: PaymentLinkEntity[] }>
        )({
          reference_id: referenceId,
          count: 20,
        }),
      );
      return response.items ?? [];
    } catch (error) {
      if (error instanceof RazorpayReadError) {
        throw error;
      }
      throw mapReadProviderError(error);
    }
  }

  async listRefundsForPayment(providerPaymentId: string): Promise<RefundEntity[]> {
    if (process.env.RAZORPAY_MOCK_MODE === 'true') {
      return [];
    }

    const client = this.createClient();
    try {
      const paymentsClient = client.payments as unknown as {
        allRefunds: (
          paymentId: string,
          params: { count: number },
        ) => Promise<{ items?: RefundEntity[] }>;
      };
      const response = await this.withReadTimeout(
        paymentsClient.allRefunds(providerPaymentId, {
          count: 50,
        }),
      );
      return response.items ?? [];
    } catch (error) {
      if (error instanceof RazorpayReadError) {
        throw error;
      }
      throw mapReadProviderError(error);
    }
  }
}
