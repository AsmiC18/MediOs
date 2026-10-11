import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentCheckoutIntentStatus,
  PaymentPayerType,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { RAZORPAY_CHECKOUT_ADAPTER } from './razorpay-checkout.adapter';
import type { RazorpayCheckoutAdapter } from './razorpay-checkout.adapter';
import { roundMoney } from './utils/money.util';

type User = { sub: string; hospitalId: string; branchId?: string | null };

@Injectable()
export class PaymentCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly invoiceSplitPayerService: InvoiceSplitPayerService,
    @Inject(RAZORPAY_CHECKOUT_ADAPTER)
    private readonly checkoutAdapter: RazorpayCheckoutAdapter,
  ) {}

  async createCheckoutIntent(
    user: User,
    input: { invoiceId: string; idempotencyKey: string; amount: number },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, hospitalId: user.hospitalId },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.branchId) {
      assertBranchAccess(user, invoice.branchId);
    }
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw new BadRequestException('Invoice is not payable via checkout');
    }
    const balances =
      await this.invoiceSplitPayerService.computeBalancesForInvoice(invoice);
    const expectedAmount = roundMoney(balances.patientOutstanding);
    const requestedAmount = roundMoney(new Prisma.Decimal(input.amount));
    if (!requestedAmount.equals(expectedAmount)) {
      throw new BadRequestException(
        'Checkout amount must match patient outstanding balance',
      );
    }
    if (input.amount <= 0) {
      throw new BadRequestException('Checkout amount must be positive');
    }

    const existing = await this.prisma.paymentCheckoutIntent.findUnique({
      where: {
        hospitalId_idempotencyKey: {
          hospitalId: user.hospitalId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      return existing;
    }

    const intent = await this.prisma.paymentCheckoutIntent.create({
      data: {
        hospitalId: user.hospitalId,
        branchId: invoice.branchId,
        invoiceId: invoice.id,
        amount: new Prisma.Decimal(input.amount),
        status: PaymentCheckoutIntentStatus.CREATED,
        idempotencyKey: input.idempotencyKey,
        createdByUserId: user.sub,
      },
    });

    const order = await this.checkoutAdapter.createOrder({
      hospitalId: user.hospitalId,
      amountPaise: Math.round(input.amount * 100),
      currency: invoice.currency,
      receipt: intent.id,
      idempotencyKey: input.idempotencyKey,
    });

    if (order.outcome === 'unavailable') {
      await this.prisma.paymentCheckoutIntent.update({
        where: { id: intent.id },
        data: {
          status: PaymentCheckoutIntentStatus.FAILED,
          lastError: order.reason,
        },
      });
      throw new ServiceUnavailableException(order.reason);
    }

    const payment = await this.prisma.payment.create({
      data: {
        hospitalId: user.hospitalId,
        branchId: invoice.branchId,
        invoiceId: invoice.id,
        amount: requestedAmount,
        currency: invoice.currency,
        status: PaymentStatus.INITIATED,
        payerType: PaymentPayerType.PATIENT,
        provider: PaymentProvider.RAZORPAY,
        providerOrderId: order.providerOrderId,
      },
    });

    const updated = await this.prisma.paymentCheckoutIntent.update({
      where: { id: intent.id },
      data: {
        status: PaymentCheckoutIntentStatus.PENDING,
        providerOrderId: order.providerOrderId,
        paymentId: payment.id,
      },
    });

    await this.auditService.log({
      action: 'PAYMENT_CHECKOUT_INTENT_CREATED',
      entity: 'PaymentCheckoutIntent',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { invoiceId: invoice.id, providerOrderId: order.providerOrderId },
    });

    return updated;
  }
}
