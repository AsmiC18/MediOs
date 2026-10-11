import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  Payment,
  PaymentPayerType,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  RazorpayRefundWebhookPayload,
  RefundsService,
} from './refunds.service';
import { resolvePrivacyAuditUserId } from '../privacy/patient-privacy-access.util';
import { PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES } from './payment-reconciliation.types';
import { RazorpayError } from './razorpay.errors';
import { RazorpayService } from './razorpay.service';
import { roundMoney, toDecimal } from './utils/money.util';
import { verifyRazorpayWebhookSignature } from './utils/webhook-signature.util';
import {
  reconcileCheckoutIntentOnPaymentFailure,
  reconcileCheckoutIntentOnPaymentSuccess,
  reconcileCheckoutIntentOnPaymentUncertain,
} from './payment-checkout-intent-reconciliation.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
  auditUserId?: string | null;
};

type RazorpayWebhookPayload = RazorpayRefundWebhookPayload & {
  payload?: RazorpayRefundWebhookPayload['payload'] & {
    payment?: {
      entity?: {
        id?: string;
        amount?: number;
        currency?: string;
        order_id?: string;
        error_description?: string;
        error_reason?: string;
      };
    };
    payment_link?: {
      entity?: {
        id?: string;
        reference_id?: string;
        amount?: number;
        currency?: string;
      };
    };
  };
};

const SUCCESS_EVENTS = new Set(['payment_link.paid', 'payment.captured']);
const FAILURE_EVENTS = new Set(['payment.failed']);
const REFUND_EVENTS = new Set(['refund.processed', 'refund.failed']);

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly razorpayService: RazorpayService,
    private readonly refundsService: RefundsService,
    private readonly invoiceSplitPayerService: InvoiceSplitPayerService,
  ) {}

  private async findOwnedInvoice(
    user: AuthenticatedUser,
    invoiceId: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        hospitalId: user.hospitalId,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    assertBranchAccess(user, invoice.branchId);

    return invoice;
  }

  private async findOwnedPayment(
    user: AuthenticatedUser,
    paymentId: string,
  ): Promise<Payment> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        hospitalId: user.hospitalId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    assertBranchAccess(user, payment.branchId);

    return payment;
  }

  private assertInvoicePayable(status: InvoiceStatus): void {
    if (status === InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        'Payment cannot be created for a draft invoice',
      );
    }

    if (status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        'Payment cannot be created for a cancelled invoice',
      );
    }

    if (status === InvoiceStatus.PAID) {
      throw new ConflictException('Invoice is already paid');
    }
  }

  private formatAmount(amount: Prisma.Decimal): string {
    return roundMoney(amount).toFixed(2);
  }

  private sanitizeFailureReason(reason: string | undefined): string | null {
    if (!reason) {
      return null;
    }

    return reason.slice(0, 500);
  }

  private extractProviderEventId(
    payload: RazorpayWebhookPayload,
    fallbackSignature: string,
  ): string {
    if (payload.id) {
      return payload.id;
    }

    const paymentId = payload.payload?.payment?.entity?.id;
    const refundId = payload.payload?.refund?.entity?.id;
    const event = payload.event ?? 'unknown';

    if (refundId) {
      return `${event}:${refundId}`;
    }

    if (paymentId) {
      return `${event}:${paymentId}`;
    }

    return `${event}:${fallbackSignature.slice(0, 32)}`;
  }

  private resolvePaymentLookup(payload: RazorpayWebhookPayload): {
    paymentId?: string;
    providerPaymentLinkId?: string;
    providerPaymentId?: string;
    providerOrderId?: string;
  } {
    const paymentLinkEntity = payload.payload?.payment_link?.entity;
    const paymentEntity = payload.payload?.payment?.entity;

    return {
      paymentId: paymentLinkEntity?.reference_id,
      providerPaymentLinkId: paymentLinkEntity?.id,
      providerPaymentId: paymentEntity?.id,
      providerOrderId: paymentEntity?.order_id,
    };
  }

  private normalizeProviderAmount(amountPaise: number): Prisma.Decimal {
    return roundMoney(toDecimal(amountPaise).div(100));
  }

  private amountsMatch(
    expected: Prisma.Decimal,
    providerAmountPaise: number | undefined,
    currency: string,
    expectedCurrency: string,
  ): boolean {
    if (!providerAmountPaise) {
      return false;
    }

    if (currency.toUpperCase() !== expectedCurrency.toUpperCase()) {
      return false;
    }

    const providerAmount = this.normalizeProviderAmount(providerAmountPaise);
    return providerAmount.equals(roundMoney(expected));
  }

  async initiatePayment(user: AuthenticatedUser, invoiceId: string) {
    const { invoice, payment, amount } = await this.prisma.$transaction(
      async (tx) => {
        const lockedInvoice =
          await this.invoiceSplitPayerService.lockInvoiceForUpdate(
            tx,
            invoiceId,
            user.hospitalId,
          );
        assertBranchAccess(user, lockedInvoice.branchId);
        this.assertInvoicePayable(lockedInvoice.status);

        const inFlightPayment = await tx.payment.findFirst({
          where: {
            invoiceId,
            hospitalId: user.hospitalId,
            payerType: PaymentPayerType.PATIENT,
            status: { in: PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES },
          },
        });

        if (inFlightPayment) {
          throw new ConflictException(
            'A payment is already in progress for this invoice',
          );
        }

        const balances =
          await this.invoiceSplitPayerService.computeBalancesForInvoice(
            lockedInvoice,
            tx,
          );

        if (balances.patientOutstanding.lessThanOrEqualTo(0)) {
          throw new ConflictException(
            'No patient balance remaining on this invoice',
          );
        }

        const patientAmount = balances.patientOutstanding;

        const createdPayment = await tx.payment.create({
          data: {
            hospitalId: user.hospitalId,
            branchId: lockedInvoice.branchId,
            invoiceId: lockedInvoice.id,
            amount: patientAmount,
            currency: lockedInvoice.currency,
            provider: PaymentProvider.RAZORPAY,
            payerType: PaymentPayerType.PATIENT,
            status: PaymentStatus.INITIATED,
          },
        });

        return {
          invoice: lockedInvoice,
          payment: createdPayment,
          amount: patientAmount,
        };
      },
    );

    try {
      const link = await this.razorpayService.createPaymentLink({
        paymentId: payment.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: this.formatAmount(amount),
        currency: invoice.currency,
      });

      const updatedPayment = await this.prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: PaymentStatus.PENDING,
          providerPaymentLinkId: link.providerPaymentLinkId,
        },
      });

      await this.auditService.log({
        action: 'PAYMENT_INITIATED',
        entity: 'Payment',
        entityId: updatedPayment.id,
        hospitalId: user.hospitalId,
        branchId: updatedPayment.branchId,
        userId: resolvePrivacyAuditUserId(user),
        metadata: {
          invoiceId: invoice.id,
          amount: this.formatAmount(updatedPayment.amount),
          providerPaymentLinkId: updatedPayment.providerPaymentLinkId,
        },
      });

      return {
        paymentId: updatedPayment.id,
        status: updatedPayment.status,
        amount: this.formatAmount(updatedPayment.amount),
        currency: updatedPayment.currency,
        paymentLinkUrl: link.paymentLinkUrl,
        providerPaymentLinkId: updatedPayment.providerPaymentLinkId,
      };
    } catch (error) {
      if (error instanceof RazorpayError && error.kind === 'ambiguous') {
        const uncertainPayment = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUBMIT_UNCERTAIN,
            failureReason: this.sanitizeFailureReason(error.message),
          },
        });

        await this.auditService.log({
          action: 'PAYMENT_SUBMIT_UNCERTAIN',
          entity: 'Payment',
          entityId: uncertainPayment.id,
          hospitalId: user.hospitalId,
          branchId: uncertainPayment.branchId,
          userId: resolvePrivacyAuditUserId(user),
          metadata: {
            invoiceId: invoice.id,
            amount: this.formatAmount(uncertainPayment.amount),
          },
        });

        return {
          paymentId: uncertainPayment.id,
          status: uncertainPayment.status,
          amount: this.formatAmount(uncertainPayment.amount),
          currency: uncertainPayment.currency,
          paymentLinkUrl: null,
          providerPaymentLinkId: uncertainPayment.providerPaymentLinkId,
        };
      }

      await this.prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: this.sanitizeFailureReason(
            error instanceof Error ? error.message : 'Payment link creation failed',
          ),
        },
      });

      throw error;
    }
  }

  async listPaymentsForInvoice(user: AuthenticatedUser, invoiceId: string) {
    await this.findOwnedInvoice(user, invoiceId);

    return this.prisma.payment.findMany({
      where: {
        invoiceId,
        hospitalId: user.hospitalId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getPayment(user: AuthenticatedUser, paymentId: string) {
    return this.findOwnedPayment(user, paymentId);
  }

  async handleRazorpayWebhook(rawBody: Buffer, signature: string | undefined) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new BadRequestException('Razorpay webhook is not configured');
    }

    if (!verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret)) {
      throw new UnauthorizedException('Invalid Razorpay webhook signature');
    }

    let payload: RazorpayWebhookPayload;

    try {
      payload = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookPayload;
    } catch {
      throw new BadRequestException('Invalid Razorpay webhook payload');
    }

    const eventType = payload.event;

    if (!eventType) {
      throw new BadRequestException('Missing Razorpay webhook event type');
    }

    const providerEventId = this.extractProviderEventId(
      payload,
      signature ?? 'unsigned',
    );

    if (REFUND_EVENTS.has(eventType)) {
      return this.refundsService.processRefundWebhook(
        payload,
        providerEventId,
        eventType,
      );
    }

    const lookup = this.resolvePaymentLookup(payload);
    const payment = await this.findPaymentForWebhook(lookup);

    if (!payment) {
      return { processed: false, reason: 'payment_not_found' };
    }

    const duplicateResult = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.paymentWebhookEvent.create({
          data: {
            provider: PaymentProvider.RAZORPAY,
            providerEventId,
            paymentId: payment.id,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return { duplicate: true as const };
        }

        throw error;
      }

      if (SUCCESS_EVENTS.has(eventType)) {
        const outcome = await this.processSuccessWebhook(
          tx,
          payment,
          payload,
          providerEventId,
          eventType,
        );
        return { duplicate: false as const, outcome };
      }

      if (FAILURE_EVENTS.has(eventType)) {
        await this.processFailureWebhook(
          tx,
          payment,
          payload,
          providerEventId,
          eventType,
        );
        return { duplicate: false as const, outcome: 'failed' as const };
      }

      await this.auditService.log({
        action: 'PAYMENT_WEBHOOK_PROCESSED',
        entity: 'Payment',
        entityId: payment.id,
        hospitalId: payment.hospitalId,
        branchId: payment.branchId,
        metadata: {
          providerEventId,
          eventType,
          duplicate: false,
          ignored: true,
        },
      });

      return { duplicate: false as const, outcome: 'ignored' as const };
    });

    if (duplicateResult.duplicate) {
      await this.auditService.log({
        action: 'PAYMENT_WEBHOOK_PROCESSED',
        entity: 'Payment',
        entityId: payment.id,
        hospitalId: payment.hospitalId,
        branchId: payment.branchId,
        metadata: {
          providerEventId,
          eventType,
          duplicate: true,
        },
      });

      return { processed: true, duplicate: true };
    }

    if (duplicateResult.outcome === 'amount_mismatch') {
      await this.auditAmountMismatch(payment, providerEventId, eventType);
      await this.prisma.$transaction(async (tx) => {
        await reconcileCheckoutIntentOnPaymentUncertain(
          tx,
          payment,
          'webhook_amount_mismatch',
        );
      });
    }

    return {
      processed: true,
      duplicate: false,
      outcome: duplicateResult.outcome,
    };
  }

  private async findPaymentForWebhook(lookup: {
    paymentId?: string;
    providerPaymentLinkId?: string;
    providerPaymentId?: string;
    providerOrderId?: string;
  }): Promise<Payment | null> {
    if (lookup.paymentId) {
      const byReference = await this.prisma.payment.findUnique({
        where: {
          id: lookup.paymentId,
        },
      });

      if (byReference) {
        return byReference;
      }
    }

    if (lookup.providerPaymentLinkId) {
      const byLink = await this.prisma.payment.findFirst({
        where: {
          provider: PaymentProvider.RAZORPAY,
          providerPaymentLinkId: lookup.providerPaymentLinkId,
        },
      });

      if (byLink) {
        return byLink;
      }
    }

    if (lookup.providerPaymentId) {
      const byProviderPayment = await this.prisma.payment.findFirst({
        where: {
          provider: PaymentProvider.RAZORPAY,
          providerPaymentId: lookup.providerPaymentId,
        },
      });
      if (byProviderPayment) {
        return byProviderPayment;
      }
    }

    if (lookup.providerOrderId) {
      return this.prisma.payment.findFirst({
        where: {
          provider: PaymentProvider.RAZORPAY,
          providerOrderId: lookup.providerOrderId,
        },
      });
    }

    return null;
  }

  private async processSuccessWebhook(
    tx: Prisma.TransactionClient,
    payment: Payment,
    payload: RazorpayWebhookPayload,
    providerEventId: string,
    eventType: string,
  ): Promise<'success' | 'amount_mismatch' | 'ignored'> {
    if (payment.status === PaymentStatus.SUCCEEDED) {
      await reconcileCheckoutIntentOnPaymentSuccess(tx, payment);
      return 'ignored';
    }

    const paymentEntity = payload.payload?.payment?.entity;
    const paymentLinkEntity = payload.payload?.payment_link?.entity;
    const providerAmountPaise =
      paymentEntity?.amount ?? paymentLinkEntity?.amount;
    const providerCurrency =
      paymentEntity?.currency ?? paymentLinkEntity?.currency ?? payment.currency;

    const invoice = await tx.invoice.findUnique({
      where: {
        id: payment.invoiceId,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found for payment');
    }

    if (
      !this.amountsMatch(
        payment.amount,
        providerAmountPaise,
        providerCurrency,
        invoice.currency,
      )
    ) {
      await reconcileCheckoutIntentOnPaymentUncertain(
        tx,
        payment,
        'webhook_amount_mismatch',
      );
      return 'amount_mismatch';
    }

    if (
      !PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES.includes(payment.status)
    ) {
      return 'ignored';
    }

    const now = new Date();
    const providerPaymentId = paymentEntity?.id ?? payment.providerPaymentId;
    const providerOrderId = paymentEntity?.order_id ?? payment.providerOrderId;
    const providerPaymentLinkId =
      paymentLinkEntity?.id ?? payment.providerPaymentLinkId;

    try {
      await tx.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: PaymentStatus.SUCCEEDED,
          providerPaymentId,
          providerPaymentLinkId,
          providerOrderId,
          paidAt: now,
          failureReason: null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'ignored';
      }

      throw error;
    }

    await this.invoiceSplitPayerService.syncInvoiceSettlementStatus(tx, invoice, {
      source: 'razorpay',
      paymentId: payment.id,
    });

    const checkoutOutcome = await reconcileCheckoutIntentOnPaymentSuccess(tx, payment);
    if (checkoutOutcome === 'updated' || checkoutOutcome === 'already_terminal') {
      await this.auditService.log({
        action: 'PAYMENT_CHECKOUT_INTENT_RECONCILED',
        entity: 'PaymentCheckoutIntent',
        entityId: payment.id,
        hospitalId: payment.hospitalId,
        branchId: payment.branchId,
        metadata: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          outcome: checkoutOutcome,
          targetStatus: 'PAID',
        },
      });
    }

    await this.auditService.log({
      action: 'PATIENT_PAYMENT_RECORDED',
      entity: 'Payment',
      entityId: payment.id,
      hospitalId: payment.hospitalId,
      branchId: payment.branchId,
      userId: null,
      metadata: {
        invoiceId: payment.invoiceId,
        amount: this.formatAmount(payment.amount),
        payerType: PaymentPayerType.PATIENT,
      },
    });

    await this.auditService.log({
      action: 'PAYMENT_SUCCEEDED',
      entity: 'Payment',
      entityId: payment.id,
      hospitalId: payment.hospitalId,
      branchId: payment.branchId,
      metadata: {
        invoiceId: payment.invoiceId,
        providerPaymentId,
        amount: this.formatAmount(payment.amount),
      },
    });

    await this.auditService.log({
      action: 'PAYMENT_WEBHOOK_PROCESSED',
      entity: 'Payment',
      entityId: payment.id,
      hospitalId: payment.hospitalId,
      branchId: payment.branchId,
      metadata: {
        providerEventId,
        eventType,
        duplicate: false,
      },
    });

    return 'success';
  }

  private async auditAmountMismatch(
    payment: Payment,
    providerEventId: string,
    eventType: string,
  ): Promise<void> {
    await this.auditService.log({
      action: 'PAYMENT_WEBHOOK_PROCESSED',
      entity: 'Payment',
      entityId: payment.id,
      hospitalId: payment.hospitalId,
      branchId: payment.branchId,
      metadata: {
        providerEventId,
        eventType,
        duplicate: false,
        rejected: true,
        reason: 'amount_mismatch',
      },
    });
  }

  private async processFailureWebhook(
    tx: Prisma.TransactionClient,
    payment: Payment,
    payload: RazorpayWebhookPayload,
    providerEventId: string,
    eventType: string,
  ): Promise<void> {
    if (
      payment.status === PaymentStatus.SUCCEEDED ||
      payment.status === PaymentStatus.FAILED
    ) {
      return;
    }

    const paymentEntity = payload.payload?.payment?.entity;
    const failureReason = this.sanitizeFailureReason(
      paymentEntity?.error_description ??
        paymentEntity?.error_reason ??
        'Payment failed',
    );

    await tx.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: PaymentStatus.FAILED,
        failureReason,
        providerPaymentId: paymentEntity?.id ?? payment.providerPaymentId,
        providerOrderId: paymentEntity?.order_id ?? payment.providerOrderId,
      },
    });

    await reconcileCheckoutIntentOnPaymentFailure(
      tx,
      payment,
      failureReason ?? 'Payment failed',
    );

    await this.auditService.log({
      action: 'PAYMENT_FAILED',
      entity: 'Payment',
      entityId: payment.id,
      hospitalId: payment.hospitalId,
      branchId: payment.branchId,
      metadata: {
        invoiceId: payment.invoiceId,
        failureReason,
      },
    });

    await this.auditService.log({
      action: 'PAYMENT_WEBHOOK_PROCESSED',
      entity: 'Payment',
      entityId: payment.id,
      hospitalId: payment.hospitalId,
      branchId: payment.branchId,
      metadata: {
        providerEventId,
        eventType,
        duplicate: false,
      },
    });
  }
}
