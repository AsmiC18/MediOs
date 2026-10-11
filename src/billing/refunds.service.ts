import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Payment,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  Refund,
  RefundStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import {
  REFUND_BALANCE_RESERVATION_STATUSES,
  REFUND_RECONCILIATION_RESOLVABLE_STATUSES,
} from './refund-reconciliation.types';
import { RejectRefundDto } from './dto/reject-refund.dto';
import { RazorpayError } from './razorpay.errors';
import { RazorpayService } from './razorpay.service';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { roundMoney, toDecimal } from './utils/money.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

export type RazorpayRefundWebhookPayload = {
  event?: string;
  id?: string;
  payload?: {
    refund?: {
      entity?: {
        id?: string;
        payment_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        error_description?: string;
      };
    };
    payment?: {
      entity?: {
        id?: string;
      };
    };
  };
};

const REFUND_SUCCESS_EVENTS = new Set(['refund.processed']);
const REFUND_FAILURE_EVENTS = new Set(['refund.failed']);

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly razorpayService: RazorpayService,
    private readonly invoiceSplitPayerService: InvoiceSplitPayerService,
  ) {}

  private formatAmount(amount: Prisma.Decimal): string {
    return roundMoney(amount).toFixed(2);
  }

  private sanitizeFailureReason(reason: string | undefined): string | null {
    if (!reason) {
      return null;
    }

    return reason.slice(0, 500);
  }

  private sanitizeReason(reason: string | undefined): string | null {
    if (!reason) {
      return null;
    }

    return reason.slice(0, 500);
  }

  private formatRefundResponse(refund: Refund) {
    return {
      refundId: refund.id,
      paymentId: refund.paymentId,
      status: refund.status,
      amount: this.formatAmount(refund.amount),
      currency: refund.currency,
      providerRefundId: refund.providerRefundId,
    };
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

  private async findOwnedRefund(
    user: AuthenticatedUser,
    refundId: string,
  ): Promise<Refund> {
    const refund = await this.prisma.refund.findFirst({
      where: {
        id: refundId,
        hospitalId: user.hospitalId,
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    assertBranchAccess(user, refund.branchId);

    return refund;
  }

  private assertPaymentRefundable(payment: Payment): void {
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException(
        'Only successful payments can be refunded',
      );
    }

    if (payment.provider !== PaymentProvider.RAZORPAY) {
      throw new BadRequestException(
        'Only Razorpay payments can be refunded through this API',
      );
    }

    if (!payment.providerPaymentId) {
      throw new BadRequestException(
        'Payment has no Razorpay provider reference and cannot be refunded online',
      );
    }
  }

  private async calculateRemainingRefundableForClient(
    db: PrismaService | Prisma.TransactionClient,
    paymentId: string,
    excludeRefundId?: string,
  ): Promise<Prisma.Decimal> {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const [succeededAgg, reservedAgg] = await Promise.all([
      db.refund.aggregate({
        where: {
          paymentId,
          status: RefundStatus.SUCCEEDED,
        },
        _sum: {
          amount: true,
        },
      }),
      db.refund.aggregate({
        where: {
          paymentId,
          status: {
            in: REFUND_BALANCE_RESERVATION_STATUSES,
          },
          ...(excludeRefundId ? { id: { not: excludeRefundId } } : {}),
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    const succeededTotal = roundMoney(
      succeededAgg._sum.amount ?? new Prisma.Decimal(0),
    );
    const reservedTotal = roundMoney(
      reservedAgg._sum.amount ?? new Prisma.Decimal(0),
    );

    return roundMoney(
      roundMoney(payment.amount).sub(succeededTotal).sub(reservedTotal),
    );
  }

  async calculateRemainingRefundable(paymentId: string): Promise<Prisma.Decimal> {
    return this.calculateRemainingRefundableForClient(this.prisma, paymentId);
  }

  private async lockPaymentForUpdate(
    tx: Prisma.TransactionClient,
    paymentId: string,
    hospitalId: string,
  ): Promise<Payment> {
    const rows = await tx.$queryRaw<Payment[]>`
      SELECT * FROM "Payment"
      WHERE "id" = ${paymentId} AND "hospitalId" = ${hospitalId}
      FOR UPDATE
    `;
    const payment = rows[0];
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  async createRefund(
    user: AuthenticatedUser,
    paymentId: string,
    dto: CreateRefundDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('X-Idempotency-Key header is required');
    }

    const clientRequestId = idempotencyKey.trim();

    const existing = await this.prisma.refund.findUnique({
      where: {
        paymentId_clientRequestId: {
          paymentId,
          clientRequestId,
        },
      },
    });

    if (existing) {
      return this.formatRefundResponse(existing);
    }

    const payment = await this.findOwnedPayment(user, paymentId);
    this.assertPaymentRefundable(payment);

    const reason = this.sanitizeReason(dto.reason.trim());
    if (!reason) {
      throw new BadRequestException('Refund reason is required');
    }

    const requestedAmount = roundMoney(toDecimal(dto.amount));

    if (requestedAmount.lte(0)) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    const refund = await this.prisma.$transaction(async (tx) => {
      const lockedPayment = await this.lockPaymentForUpdate(
        tx,
        payment.id,
        user.hospitalId,
      );
      this.assertPaymentRefundable(lockedPayment);

      const remainingRefundable =
        await this.calculateRemainingRefundableForClient(tx, lockedPayment.id);

      if (requestedAmount.gt(remainingRefundable)) {
        throw new BadRequestException(
          'Refund amount exceeds remaining refundable amount',
        );
      }

      return tx.refund.create({
        data: {
          hospitalId: user.hospitalId,
          branchId: lockedPayment.branchId,
          paymentId: lockedPayment.id,
          amount: requestedAmount,
          currency: lockedPayment.currency,
          provider: PaymentProvider.RAZORPAY,
          status: RefundStatus.REQUESTED,
          providerPaymentId: lockedPayment.providerPaymentId,
          clientRequestId,
          reason,
          requestedByUserId: user.sub,
        },
      });
    });

    await this.auditService.log({
      action: 'REFUND_REQUESTED',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: user.hospitalId,
      branchId: refund.branchId,
      userId: user.sub,
      metadata: {
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amount: this.formatAmount(refund.amount),
        requestedByUserId: user.sub,
      },
    });

    return this.formatRefundResponse(refund);
  }

  async approveRefund(user: AuthenticatedUser, refundId: string) {
    const refund = await this.findOwnedRefund(user, refundId);

    if (refund.status !== RefundStatus.REQUESTED) {
      throw new BadRequestException(
        'Only requested refunds can be approved',
      );
    }

    if (
      refund.requestedByUserId &&
      refund.requestedByUserId === user.sub
    ) {
      throw new ForbiddenException(
        'Refund requester cannot approve their own refund',
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: refund.paymentId },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    this.assertPaymentRefundable(payment);

    const now = new Date();
    const approved = await this.prisma.$transaction(async (tx) => {
      await this.lockPaymentForUpdate(tx, payment.id, user.hospitalId);

      const current = await tx.refund.findFirst({
        where: { id: refundId, hospitalId: user.hospitalId },
      });
      if (!current || current.status !== RefundStatus.REQUESTED) {
        throw new BadRequestException(
          'Only requested refunds can be approved',
        );
      }

      const remaining = await this.calculateRemainingRefundableForClient(
        tx,
        payment.id,
        refundId,
      );
      if (roundMoney(current.amount).gt(remaining)) {
        throw new BadRequestException(
          'Refund amount exceeds remaining refundable amount',
        );
      }

      return tx.refund.update({
        where: { id: refundId },
        data: {
          status: RefundStatus.APPROVED,
          approvedByUserId: user.sub,
          approvedAt: now,
        },
      });
    });

    await this.auditService.log({
      action: 'REFUND_APPROVED',
      entity: 'Refund',
      entityId: approved.id,
      hospitalId: user.hospitalId,
      branchId: approved.branchId,
      userId: user.sub,
      metadata: {
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amount: this.formatAmount(approved.amount),
        requestedByUserId: approved.requestedByUserId,
        approvedByUserId: user.sub,
      },
    });

    return this.executeApprovedRefund(user, approved.id);
  }

  async rejectRefund(
    user: AuthenticatedUser,
    refundId: string,
    dto: RejectRefundDto,
  ) {
    const rejectionReason = this.sanitizeReason(dto.rejectionReason);
    if (!rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    const refund = await this.findOwnedRefund(user, refundId);

    if (refund.status !== RefundStatus.REQUESTED) {
      throw new BadRequestException('Only requested refunds can be rejected');
    }

    const now = new Date();
    const rejected = await this.prisma.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.REJECTED,
        rejectedByUserId: user.sub,
        rejectedAt: now,
        rejectionReason,
      },
    });

    const payment = await this.prisma.payment.findUnique({
      where: { id: rejected.paymentId },
    });

    await this.auditService.log({
      action: 'REFUND_REJECTED',
      entity: 'Refund',
      entityId: rejected.id,
      hospitalId: user.hospitalId,
      branchId: rejected.branchId,
      userId: user.sub,
      metadata: {
        paymentId: rejected.paymentId,
        invoiceId: payment?.invoiceId,
        amount: this.formatAmount(rejected.amount),
        rejectedByUserId: user.sub,
        rejectionReason,
      },
    });

    return this.formatRefundResponse(rejected);
  }

  async executeApprovedRefund(user: AuthenticatedUser, refundId: string) {
    const refund = await this.findOwnedRefund(user, refundId);

    if (refund.status !== RefundStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved refunds can be executed',
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: refund.paymentId },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    this.assertPaymentRefundable(payment);

    await this.auditService.log({
      action: 'REFUND_EXECUTING',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: user.hospitalId,
      branchId: refund.branchId,
      userId: user.sub,
      metadata: {
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amount: this.formatAmount(refund.amount),
        approvedByUserId: refund.approvedByUserId,
      },
    });

    try {
      const providerRefund = await this.razorpayService.createRefund({
        refundId: refund.id,
        providerPaymentId: payment.providerPaymentId!,
        amount: this.formatAmount(refund.amount),
        currency: payment.currency,
        reason: refund.reason ?? undefined,
      });

      const updatedRefund = await this.prisma.refund.update({
        where: {
          id: refund.id,
        },
        data: {
          status: RefundStatus.PROCESSING,
          providerRefundId: providerRefund.providerRefundId,
        },
      });

      await this.auditService.log({
        action: 'REFUND_INITIATED',
        entity: 'Refund',
        entityId: updatedRefund.id,
        hospitalId: user.hospitalId,
        branchId: updatedRefund.branchId,
        userId: user.sub,
        metadata: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          amount: this.formatAmount(updatedRefund.amount),
          providerRefundId: updatedRefund.providerRefundId,
        },
      });

      return this.formatRefundResponse(updatedRefund);
    } catch (error) {
      if (error instanceof RazorpayError && error.kind === 'ambiguous') {
        const uncertainRefund = await this.prisma.refund.update({
          where: { id: refund.id },
          data: {
            status: RefundStatus.SUBMIT_UNCERTAIN,
            failureReason: this.sanitizeFailureReason(error.message),
          },
        });

        await this.auditService.log({
          action: 'REFUND_SUBMIT_UNCERTAIN',
          entity: 'Refund',
          entityId: uncertainRefund.id,
          hospitalId: user.hospitalId,
          branchId: uncertainRefund.branchId,
          userId: user.sub,
          metadata: {
            paymentId: payment.id,
            invoiceId: payment.invoiceId,
            amount: this.formatAmount(uncertainRefund.amount),
          },
        });

        return this.formatRefundResponse(uncertainRefund);
      }

      const failureReason = this.sanitizeFailureReason(
        error instanceof Error ? error.message : 'Refund request failed',
      );

      const failedRefund = await this.prisma.refund.update({
        where: {
          id: refund.id,
        },
        data: {
          status: RefundStatus.FAILED,
          failureReason,
        },
      });

      await this.auditService.log({
        action: 'REFUND_FAILED',
        entity: 'Refund',
        entityId: failedRefund.id,
        hospitalId: user.hospitalId,
        branchId: failedRefund.branchId,
        userId: user.sub,
        metadata: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          amount: this.formatAmount(failedRefund.amount),
          failureReason,
        },
      });

      throw error;
    }
  }

  async listRefundsForPayment(user: AuthenticatedUser, paymentId: string) {
    await this.findOwnedPayment(user, paymentId);

    return this.prisma.refund.findMany({
      where: {
        paymentId,
        hospitalId: user.hospitalId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getRefund(user: AuthenticatedUser, refundId: string) {
    return this.findOwnedRefund(user, refundId);
  }

  resolveRefundLookup(payload: RazorpayRefundWebhookPayload): {
    providerRefundId?: string;
    providerPaymentId?: string;
  } {
    const refundEntity = payload.payload?.refund?.entity;
    const paymentEntity = payload.payload?.payment?.entity;

    return {
      providerRefundId: refundEntity?.id,
      providerPaymentId:
        refundEntity?.payment_id ?? paymentEntity?.id,
    };
  }

  private normalizeProviderAmount(amountPaise: number): Prisma.Decimal {
    return roundMoney(toDecimal(amountPaise).div(100));
  }

  private refundAmountsMatch(
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

  async processRefundWebhook(
    payload: RazorpayRefundWebhookPayload,
    providerEventId: string,
    eventType: string,
  ) {
    const lookup = this.resolveRefundLookup(payload);
    let refund = await this.findRefundForWebhook(lookup);

    if (!refund && lookup.providerPaymentId) {
      const uncertainCandidates = await this.prisma.refund.findMany({
        where: {
          providerPaymentId: lookup.providerPaymentId,
          status: RefundStatus.SUBMIT_UNCERTAIN,
        },
      });

      if (uncertainCandidates.length > 1) {
        await this.auditService.log({
          action: 'REFUND_WEBHOOK_PROCESSED',
          entity: 'Refund',
          entityId: uncertainCandidates[0]!.id,
          hospitalId: uncertainCandidates[0]!.hospitalId,
          branchId: uncertainCandidates[0]!.branchId,
          metadata: {
            rejected: true,
            reason: 'ambiguous_uncertain_refund',
            candidateRefundIds: uncertainCandidates.map((row) => row.id),
            providerPaymentId: lookup.providerPaymentId,
          },
        });

        return { processed: false, reason: 'refund_ambiguous_uncertain' };
      }

      if (uncertainCandidates.length === 1) {
        refund = uncertainCandidates[0]!;
      }
    }

    if (!refund) {
      return { processed: false, reason: 'refund_not_found' };
    }

    const duplicateResult = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.paymentWebhookEvent.create({
          data: {
            provider: PaymentProvider.RAZORPAY,
            providerEventId,
            paymentId: refund.paymentId,
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

      if (REFUND_SUCCESS_EVENTS.has(eventType)) {
        const outcome = await this.processRefundSuccessWebhook(
          tx,
          refund,
          payload,
          providerEventId,
          eventType,
        );
        return { duplicate: false as const, outcome };
      }

      if (REFUND_FAILURE_EVENTS.has(eventType)) {
        await this.processRefundFailureWebhook(
          tx,
          refund,
          payload,
          providerEventId,
          eventType,
        );
        return { duplicate: false as const, outcome: 'failed' as const };
      }

      await this.auditService.log({
        action: 'REFUND_WEBHOOK_PROCESSED',
        entity: 'Refund',
        entityId: refund.id,
        hospitalId: refund.hospitalId,
        branchId: refund.branchId,
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
        action: 'REFUND_WEBHOOK_PROCESSED',
        entity: 'Refund',
        entityId: refund.id,
        hospitalId: refund.hospitalId,
        branchId: refund.branchId,
        metadata: {
          providerEventId,
          eventType,
          duplicate: true,
        },
      });

      return { processed: true, duplicate: true };
    }

    if (duplicateResult.outcome === 'amount_mismatch') {
      await this.auditRefundAmountMismatch(refund, providerEventId, eventType);
    }

    return {
      processed: true,
      duplicate: false,
      outcome: duplicateResult.outcome,
    };
  }

  private async findRefundForWebhook(lookup: {
    providerRefundId?: string;
    providerPaymentId?: string;
  }): Promise<Refund | null> {
    if (lookup.providerRefundId) {
      const byRefundId = await this.prisma.refund.findFirst({
        where: {
          provider: PaymentProvider.RAZORPAY,
          providerRefundId: lookup.providerRefundId,
        },
      });

      if (byRefundId) {
        return byRefundId;
      }
    }

    return null;
  }

  private async processRefundSuccessWebhook(
    tx: Prisma.TransactionClient,
    refund: Refund,
    payload: RazorpayRefundWebhookPayload,
    providerEventId: string,
    eventType: string,
  ): Promise<'success' | 'amount_mismatch' | 'ignored'> {
    if (refund.status === RefundStatus.SUCCEEDED) {
      return 'ignored';
    }

    const refundEntity = payload.payload?.refund?.entity;
    const providerAmountPaise = refundEntity?.amount;
    const providerCurrency = refundEntity?.currency ?? refund.currency;
    const providerPaymentId =
      refundEntity?.payment_id ??
      payload.payload?.payment?.entity?.id ??
      refund.providerPaymentId;

    if (
      providerPaymentId &&
      refund.providerPaymentId &&
      providerPaymentId !== refund.providerPaymentId
    ) {
      return 'ignored';
    }

    if (
      !this.refundAmountsMatch(
        refund.amount,
        providerAmountPaise,
        providerCurrency,
        refund.currency,
      )
    ) {
      return 'amount_mismatch';
    }

    if (!REFUND_RECONCILIATION_RESOLVABLE_STATUSES.includes(refund.status)) {
      return 'ignored';
    }

    const now = new Date();
    const providerRefundId = refundEntity?.id ?? refund.providerRefundId;

    try {
      const updated = await tx.refund.updateMany({
        where: {
          id: refund.id,
          status: { in: REFUND_RECONCILIATION_RESOLVABLE_STATUSES },
        },
        data: {
          status: RefundStatus.SUCCEEDED,
          providerRefundId,
          providerPaymentId: providerPaymentId ?? refund.providerPaymentId,
          processedAt: now,
          failureReason: null,
        },
      });

      if (updated.count === 0) {
        return 'ignored';
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'ignored';
      }

      throw error;
    }

    const payment = await tx.payment.findUnique({
      where: { id: refund.paymentId },
    });

    if (payment) {
      const invoice = await tx.invoice.findUnique({
        where: { id: payment.invoiceId },
      });
      if (invoice) {
        await this.invoiceSplitPayerService.syncInvoiceSettlementStatus(
          tx,
          invoice,
          { source: 'refund_succeeded', refundId: refund.id },
        );
      }
    }

    await this.auditService.log({
      action: 'PAYER_PAYMENT_REFUNDED',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: refund.hospitalId,
      branchId: refund.branchId,
      metadata: {
        paymentId: refund.paymentId,
        invoiceId: payment?.invoiceId,
        amount: this.formatAmount(refund.amount),
      },
    });

    await this.auditService.log({
      action: 'REFUND_SUCCEEDED',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: refund.hospitalId,
      branchId: refund.branchId,
      metadata: {
        paymentId: refund.paymentId,
        invoiceId: payment?.invoiceId,
        amount: this.formatAmount(refund.amount),
        providerRefundId,
      },
    });

    await this.auditService.log({
      action: 'REFUND_WEBHOOK_PROCESSED',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: refund.hospitalId,
      branchId: refund.branchId,
      metadata: {
        providerEventId,
        eventType,
        duplicate: false,
      },
    });

    return 'success';
  }

  private async processRefundFailureWebhook(
    tx: Prisma.TransactionClient,
    refund: Refund,
    payload: RazorpayRefundWebhookPayload,
    providerEventId: string,
    eventType: string,
  ): Promise<void> {
    if (
      refund.status === RefundStatus.SUCCEEDED ||
      refund.status === RefundStatus.FAILED
    ) {
      return;
    }

    const refundEntity = payload.payload?.refund?.entity;
    const failureReason = this.sanitizeFailureReason(
      refundEntity?.error_description ?? 'Refund failed',
    );

    await tx.refund.update({
      where: {
        id: refund.id,
      },
      data: {
        status: RefundStatus.FAILED,
        failureReason,
        providerRefundId: refundEntity?.id ?? refund.providerRefundId,
        providerPaymentId:
          refundEntity?.payment_id ?? refund.providerPaymentId,
      },
    });

    const payment = await tx.payment.findUnique({
      where: { id: refund.paymentId },
    });

    await this.auditService.log({
      action: 'REFUND_FAILED',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: refund.hospitalId,
      branchId: refund.branchId,
      metadata: {
        paymentId: refund.paymentId,
        invoiceId: payment?.invoiceId,
        amount: this.formatAmount(refund.amount),
        failureReason,
      },
    });

    await this.auditService.log({
      action: 'REFUND_WEBHOOK_PROCESSED',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: refund.hospitalId,
      branchId: refund.branchId,
      metadata: {
        providerEventId,
        eventType,
        duplicate: false,
      },
    });
  }

  private async auditRefundAmountMismatch(
    refund: Refund,
    providerEventId: string,
    eventType: string,
  ): Promise<void> {
    await this.auditService.log({
      action: 'REFUND_WEBHOOK_PROCESSED',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: refund.hospitalId,
      branchId: refund.branchId,
      metadata: {
        providerEventId,
        eventType,
        duplicate: false,
        rejected: true,
        reason: 'amount_mismatch',
      },
    });
  }
}
