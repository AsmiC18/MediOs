import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PaymentCheckoutService } from './payment-checkout.service';

describe('PaymentCheckoutService', () => {
  const user = { sub: 'u1', hospitalId: 'h1', branchId: null };

  it('rejects checkout when amount does not match patient outstanding', async () => {
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv1',
          hospitalId: 'h1',
          branchId: null,
          status: InvoiceStatus.ISSUED,
          currency: 'INR',
        }),
      },
      paymentCheckoutIntent: { findUnique: jest.fn() },
    };
    const invoiceSplitPayerService = {
      computeBalancesForInvoice: jest.fn().mockResolvedValue({
        patientOutstanding: new Prisma.Decimal('500.00'),
      }),
    };
    const service = new PaymentCheckoutService(
      prisma as never,
      { log: jest.fn() } as never,
      invoiceSplitPayerService as never,
      { createOrder: jest.fn() } as never,
    );

    await expect(
      service.createCheckoutIntent(user, {
        invoiceId: 'inv1',
        idempotencyKey: 'k1',
        amount: 400,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
