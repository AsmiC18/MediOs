import { Injectable } from '@nestjs/common';

export type CheckoutOrderRequest = {
  hospitalId: string;
  amountPaise: number;
  currency: string;
  receipt: string;
  idempotencyKey: string;
};

export type CheckoutOrderResult =
  | { outcome: 'created'; providerOrderId: string }
  | { outcome: 'unavailable'; reason: string };

export interface RazorpayCheckoutAdapter {
  createOrder(input: CheckoutOrderRequest): Promise<CheckoutOrderResult>;
}

export const RAZORPAY_CHECKOUT_ADAPTER = Symbol('RAZORPAY_CHECKOUT_ADAPTER');

@Injectable()
export class UnconfiguredRazorpayCheckoutAdapter implements RazorpayCheckoutAdapter {
  async createOrder(): Promise<CheckoutOrderResult> {
    return {
      outcome: 'unavailable',
      reason:
        'Razorpay checkout is not configured (requires live merchant credentials)',
    };
  }
}
