import { Inject, Injectable } from '@nestjs/common';
import {
  Invoice,
  Payment,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  applyReconciledPaymentFailed,
  applyReconciledPaymentPending,
  applyReconciledPaymentSuccess,
} from './payment-reconciliation-success.util';
import {
  PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES,
  PaymentReconciliationContext,
  PaymentReconciliationOutcome,
  PaymentReconciliationResult,
} from './payment-reconciliation.types';
import { PaymentEntity, PaymentLinkEntity } from './razorpay-provider.types';
import { RazorpayReadError } from './razorpay.errors';
import { RAZORPAY_RECONCILIATION_READER } from './razorpay-reconciliation.reader';
import type { RazorpayReconciliationReader } from './razorpay-reconciliation.reader';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { providerAmountsMatch } from './utils/razorpay-amount.util';

const UNPAID_LINK_STATUSES = new Set(['created', 'issued', 'partially_paid']);
const TERMINAL_FAILURE_LINK_STATUSES = new Set(['cancelled', 'expired']);

@Injectable()
export class PaymentReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(RAZORPAY_RECONCILIATION_READER)
    private readonly providerReader: RazorpayReconciliationReader,
    private readonly invoiceSplitPayerService: InvoiceSplitPayerService,
  ) {}

  async reconcilePayment(
    paymentId: string,
    hospitalId: string,
    context: PaymentReconciliationContext = {},
  ): Promise<PaymentReconciliationResult> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, hospitalId },
    });

    if (!payment) {
      return this.result(paymentId, hospitalId, 'no_change', {
        message: 'payment_not_found',
      });
    }

    if (
      payment.status === PaymentStatus.SUCCEEDED ||
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.CANCELLED
    ) {
      return this.result(paymentId, hospitalId, 'no_change', {
        previousStatus: payment.status,
        newStatus: payment.status,
        message: 'terminal_status',
      });
    }

    if (!PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES.includes(payment.status)) {
      return this.result(paymentId, hospitalId, 'no_change', {
        previousStatus: payment.status,
        message: 'not_reconcilable',
      });
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: payment.invoiceId },
    });

    if (!invoice || invoice.hospitalId !== hospitalId) {
      return this.result(paymentId, hospitalId, 'mismatch', {
        previousStatus: payment.status,
        message: 'invoice_not_found_for_payment',
      });
    }

    const auditContext = {
      jobId: context.jobId,
      workerId: context.workerId,
      source: 'background_job' as const,
    };

    let linkEntity: PaymentLinkEntity | null = null;
    let linkResolution:
      | { kind: 'ok'; link: PaymentLinkEntity }
      | { kind: 'no_match' }
      | { kind: 'ambiguous' }
      | { kind: 'mismatch'; reason: string };

    try {
      linkResolution = await this.resolveProviderPaymentLink(payment, invoice);
    } catch (error) {
      return this.handleReadError(error, payment);
    }

    if (linkResolution.kind === 'no_match') {
      await this.auditReview(payment, auditContext, 'no_match', {});
      return this.result(paymentId, hospitalId, 'no_match', {
        previousStatus: payment.status,
        message: 'provider_payment_link_not_found',
      });
    }

    if (linkResolution.kind === 'ambiguous') {
      await this.auditReview(payment, auditContext, 'ambiguous', {});
      return this.result(paymentId, hospitalId, 'ambiguous', {
        previousStatus: payment.status,
        message: 'multiple_provider_payment_links',
      });
    }

    if (linkResolution.kind === 'mismatch') {
      await this.auditReview(payment, auditContext, 'mismatch', {
        reason: linkResolution.reason,
      });
      return this.result(paymentId, hospitalId, 'mismatch', {
        previousStatus: payment.status,
        message: linkResolution.reason,
      });
    }

    linkEntity = linkResolution.link;

    const linkIdConflict = await this.findProviderLinkIdConflict(
      payment,
      linkEntity.id,
    );
    if (linkIdConflict && linkIdConflict.id !== payment.id) {
      await this.auditReview(payment, auditContext, 'mismatch', {
        reason: 'provider_payment_link_id_conflict',
        conflictingPaymentId: linkIdConflict.id,
      });
      return this.result(paymentId, hospitalId, 'mismatch', {
        previousStatus: payment.status,
        message: 'provider_payment_link_id_conflict',
        providerPaymentLinkId: linkEntity.id,
      });
    }

    if (TERMINAL_FAILURE_LINK_STATUSES.has(linkEntity.status ?? '')) {
      const applyResult = await this.prisma.$transaction(async (tx) =>
        applyReconciledPaymentFailed(
          tx,
          payment,
          `Payment link ${linkEntity!.status}`,
          { providerPaymentLinkId: linkEntity!.id },
          this.auditService,
          auditContext,
        ),
      );
      return this.result(paymentId, hospitalId, 'resolved', {
        previousStatus: payment.status,
        newStatus:
          applyResult === 'applied' ? PaymentStatus.FAILED : payment.status,
        providerPaymentLinkId: linkEntity.id,
        message:
          applyResult === 'applied'
            ? 'provider_link_terminal_failure'
            : 'concurrent_resolution',
      });
    }

    const providerPaymentId = await this.resolveProviderPaymentId(
      payment,
      linkEntity,
    );

    if (providerPaymentId) {
      const paymentIdConflict = await this.findProviderPaymentIdConflict(
        payment,
        providerPaymentId,
      );
      if (paymentIdConflict && paymentIdConflict.id !== payment.id) {
        await this.auditReview(payment, auditContext, 'mismatch', {
          reason: 'provider_payment_id_conflict',
          conflictingPaymentId: paymentIdConflict.id,
        });
        return this.result(paymentId, hospitalId, 'mismatch', {
          previousStatus: payment.status,
          message: 'provider_payment_id_conflict',
          providerPaymentId,
        });
      }

      let providerPayment: PaymentEntity;
      try {
        providerPayment = await this.providerReader.fetchPayment(
          providerPaymentId,
        );
      } catch (error) {
        return this.handleReadError(error, payment);
      }

      if (providerPayment.id !== providerPaymentId) {
        await this.auditReview(payment, auditContext, 'mismatch', {
          reason: 'provider_payment_identity_mismatch',
        });
        return this.result(paymentId, hospitalId, 'mismatch', {
          previousStatus: payment.status,
          message: 'provider_payment_identity_mismatch',
        });
      }

      if (
        !providerAmountsMatch(
          payment.amount,
          providerPayment.amount,
          providerPayment.currency,
          invoice.currency,
        )
      ) {
        await this.auditReview(payment, auditContext, 'mismatch', {
          reason: 'provider_payment_amount_mismatch',
        });
        return this.result(paymentId, hospitalId, 'mismatch', {
          previousStatus: payment.status,
          message: 'provider_payment_amount_mismatch',
        });
      }

      if (this.isProviderPaymentSuccessful(providerPayment)) {
        const applyResult = await this.prisma.$transaction(async (tx) =>
          applyReconciledPaymentSuccess(
            tx,
            payment,
            invoice,
            {
              providerPaymentId: providerPayment.id,
              providerOrderId: providerPayment.order_id,
              providerPaymentLinkId: linkEntity!.id,
            },
            this.auditService,
            this.invoiceSplitPayerService,
            auditContext,
          ),
        );
        return this.result(paymentId, hospitalId, 'resolved', {
          previousStatus: payment.status,
          newStatus:
            applyResult === 'applied'
              ? PaymentStatus.SUCCEEDED
              : payment.status,
          providerPaymentLinkId: linkEntity.id,
          providerPaymentId: providerPayment.id,
          message:
            applyResult === 'applied'
              ? 'payment_succeeded'
              : 'concurrent_resolution',
        });
      }

      if (providerPayment.status === 'failed') {
        const applyResult = await this.prisma.$transaction(async (tx) =>
          applyReconciledPaymentFailed(
            tx,
            payment,
            'Payment failed at provider',
            {
              providerPaymentId: providerPayment.id,
              providerOrderId: providerPayment.order_id,
              providerPaymentLinkId: linkEntity!.id,
            },
            this.auditService,
            auditContext,
          ),
        );
        return this.result(paymentId, hospitalId, 'resolved', {
          previousStatus: payment.status,
          newStatus:
            applyResult === 'applied' ? PaymentStatus.FAILED : payment.status,
          providerPaymentLinkId: linkEntity.id,
          providerPaymentId: providerPayment.id,
        });
      }
    }

    if (linkEntity.status === 'paid' && !providerPaymentId) {
      await this.auditReview(payment, auditContext, 'no_match', {
        reason: 'paid_link_without_payment_id',
      });
      return this.result(paymentId, hospitalId, 'no_match', {
        previousStatus: payment.status,
        providerPaymentLinkId: linkEntity.id,
        message: 'paid_link_without_payment_id',
      });
    }

    if (UNPAID_LINK_STATUSES.has(linkEntity.status ?? '')) {
      const needsPending =
        payment.status === PaymentStatus.INITIATED ||
        payment.providerPaymentLinkId !== linkEntity.id;

      if (needsPending) {
        const applyResult = await this.prisma.$transaction(async (tx) =>
          applyReconciledPaymentPending(
            tx,
            payment,
            linkEntity!.id,
            this.auditService,
            auditContext,
          ),
        );
        return this.result(paymentId, hospitalId, 'resolved', {
          previousStatus: payment.status,
          newStatus:
            applyResult === 'applied'
              ? PaymentStatus.PENDING
              : payment.status,
          providerPaymentLinkId: linkEntity.id,
          message:
            applyResult === 'applied'
              ? 'payment_pending'
              : 'concurrent_resolution',
        });
      }
    }

    return this.result(paymentId, hospitalId, 'no_change', {
      previousStatus: payment.status,
      newStatus: payment.status,
      providerPaymentLinkId: linkEntity.id,
      message: 'provider_state_unchanged',
    });
  }

  private async resolveProviderPaymentLink(
    payment: Payment,
    invoice: Invoice,
  ): Promise<
    | { kind: 'ok'; link: PaymentLinkEntity }
    | { kind: 'no_match' }
    | { kind: 'ambiguous' }
    | { kind: 'mismatch'; reason: string }
  > {
    if (payment.providerPaymentLinkId) {
      try {
        const link = await this.providerReader.fetchPaymentLink(
          payment.providerPaymentLinkId,
        );
        return this.validateLinkEntity(link, payment, invoice);
      } catch (error) {
        if (error instanceof RazorpayReadError && error.kind === 'not_found') {
          const listed = await this.providerReader.listPaymentLinksByReferenceId(
            payment.id,
          );
          return this.pickLinkFromList(listed, payment, invoice);
        }
        throw error;
      }
    }

    const listed = await this.providerReader.listPaymentLinksByReferenceId(
      payment.id,
    );
    return this.pickLinkFromList(listed, payment, invoice);
  }

  private pickLinkFromList(
    links: PaymentLinkEntity[],
    payment: Payment,
    invoice: Invoice,
  ):
    | { kind: 'ok'; link: PaymentLinkEntity }
    | { kind: 'no_match' }
    | { kind: 'ambiguous' }
    | { kind: 'mismatch'; reason: string } {
    const candidates = links.filter((link) => {
      const validation = this.validateLinkEntity(link, payment, invoice);
      return validation.kind === 'ok';
    });

    if (candidates.length === 0) {
      return { kind: 'no_match' };
    }
    if (candidates.length > 1) {
      return { kind: 'ambiguous' };
    }
    return { kind: 'ok', link: candidates[0]! };
  }

  private validateLinkEntity(
    link: PaymentLinkEntity,
    payment: Payment,
    invoice: Invoice,
  ):
    | { kind: 'ok'; link: PaymentLinkEntity }
    | { kind: 'mismatch'; reason: string } {
    if (link.reference_id && link.reference_id !== payment.id) {
      return { kind: 'mismatch', reason: 'reference_id_mismatch' };
    }
    if (
      !providerAmountsMatch(
        payment.amount,
        link.amount,
        link.currency,
        invoice.currency,
      )
    ) {
      return { kind: 'mismatch', reason: 'link_amount_or_currency_mismatch' };
    }
    return { kind: 'ok', link };
  }

  private async resolveProviderPaymentId(
    payment: Payment,
    link: PaymentLinkEntity,
  ): Promise<string | null> {
    if (payment.providerPaymentId) {
      return payment.providerPaymentId;
    }
    const snapshots = this.normalizeLinkPayments(link.payments);
    const captured = snapshots.find(
      (row) => row.status === 'captured' && row.payment_id,
    );
    if (captured?.payment_id) {
      return captured.payment_id;
    }
    if (link.status === 'paid') {
      const withId = snapshots.find((row) => row.payment_id);
      if (withId?.payment_id) {
        return withId.payment_id;
      }
    }
    return null;
  }

  private normalizeLinkPayments(
    payments: PaymentLinkEntity['payments'],
  ): Array<{ payment_id?: string; status?: string }> {
    if (!payments) {
      return [];
    }
    if (Array.isArray(payments)) {
      return payments;
    }
    return [payments];
  }

  private isProviderPaymentSuccessful(payment: PaymentEntity): boolean {
    return payment.status === 'captured' || payment.captured === true;
  }

  private async findProviderPaymentIdConflict(
    payment: Payment,
    providerPaymentId: string,
  ): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: {
        provider: PaymentProvider.RAZORPAY,
        providerPaymentId,
        NOT: { id: payment.id },
      },
    });
  }

  private async findProviderLinkIdConflict(
    payment: Payment,
    providerPaymentLinkId: string,
  ): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: {
        provider: PaymentProvider.RAZORPAY,
        providerPaymentLinkId,
        NOT: { id: payment.id },
      },
    });
  }

  private handleReadError(
    error: unknown,
    payment: Payment,
  ): PaymentReconciliationResult {
    if (error instanceof RazorpayReadError) {
      if (error.kind === 'retryable') {
        throw error;
      }
      if (error.kind === 'not_found') {
        return this.result(payment.id, payment.hospitalId, 'not_found', {
          previousStatus: payment.status,
          message: error.message,
        });
      }
      throw error;
    }
    throw error;
  }

  private async auditReview(
    payment: Payment,
    auditContext: {
      jobId?: string;
      workerId?: string;
      source: 'background_job';
    },
    outcome: PaymentReconciliationOutcome,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.log({
      action: 'PAYMENT_RECONCILE_REVIEW',
      entity: 'Payment',
      entityId: payment.id,
      hospitalId: payment.hospitalId,
      branchId: payment.branchId,
      userId: null,
      metadata: {
        invoiceId: payment.invoiceId,
        previousStatus: payment.status,
        outcome,
        ...auditContext,
        ...extra,
      },
    });
  }

  private result(
    paymentId: string,
    hospitalId: string,
    outcome: PaymentReconciliationOutcome,
    fields: Partial<PaymentReconciliationResult> = {},
  ): PaymentReconciliationResult {
    return {
      outcome,
      paymentId,
      hospitalId,
      ...fields,
    };
  }
}
