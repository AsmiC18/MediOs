import { Inject, Injectable } from '@nestjs/common';
import {
  PaymentProvider,
  Refund,
  RefundStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { applyReconciledRefundUpdate } from './refund-reconciliation-success.util';
import {
  REFUND_RECONCILIATION_RESOLVABLE_STATUSES,
  RefundReconciliationContext,
  RefundReconciliationOutcome,
  RefundReconciliationResult,
} from './refund-reconciliation.types';
import { RefundEntity } from './razorpay-provider.types';
import { RazorpayReadError } from './razorpay.errors';
import { RAZORPAY_RECONCILIATION_READER } from './razorpay-reconciliation.reader';
import type { RazorpayReconciliationReader } from './razorpay-reconciliation.reader';
import { providerAmountsMatch } from './utils/razorpay-amount.util';

@Injectable()
export class RefundReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(RAZORPAY_RECONCILIATION_READER)
    private readonly providerReader: RazorpayReconciliationReader,
  ) {}

  async reconcileRefund(
    refundId: string,
    hospitalId: string,
    context: RefundReconciliationContext = {},
  ): Promise<RefundReconciliationResult> {
    const refund = await this.prisma.refund.findFirst({
      where: { id: refundId, hospitalId },
    });

    if (!refund) {
      return this.result(refundId, hospitalId, 'no_change', {
        message: 'refund_not_found',
      });
    }

    if (
      refund.status === RefundStatus.SUCCEEDED ||
      refund.status === RefundStatus.FAILED
    ) {
      return this.result(refundId, hospitalId, 'no_change', {
        previousStatus: refund.status,
        newStatus: refund.status,
        message: 'terminal_status',
      });
    }

    if (!REFUND_RECONCILIATION_RESOLVABLE_STATUSES.includes(refund.status)) {
      return this.result(refundId, hospitalId, 'no_change', {
        previousStatus: refund.status,
        message: 'not_reconcilable',
      });
    }

    if (!refund.providerPaymentId) {
      await this.auditReview(refund, context, 'mismatch', {
        reason: 'missing_provider_payment_id',
      });
      return this.result(refundId, hospitalId, 'mismatch', {
        previousStatus: refund.status,
        message: 'missing_provider_payment_id',
      });
    }

    const auditContext = {
      jobId: context.jobId,
      workerId: context.workerId,
      source: 'background_job' as const,
    };

    let providerRefund: RefundEntity;
    try {
      const resolved = await this.resolveProviderRefund(refund);
      if (resolved.kind === 'no_match') {
        await this.auditReview(refund, context, 'no_match', {});
        return this.result(refundId, hospitalId, 'no_match', {
          previousStatus: refund.status,
          message: 'provider_refund_not_found',
        });
      }
      if (resolved.kind === 'ambiguous') {
        await this.auditReview(refund, context, 'ambiguous', {
          candidateProviderRefundIds: resolved.candidateIds,
        });
        return this.result(refundId, hospitalId, 'ambiguous', {
          previousStatus: refund.status,
          message: 'multiple_provider_refunds',
        });
      }
      if (resolved.kind === 'mismatch') {
        await this.auditReview(refund, context, 'mismatch', {
          reason: resolved.reason,
        });
        return this.result(refundId, hospitalId, 'mismatch', {
          previousStatus: refund.status,
          message: resolved.reason,
        });
      }
      providerRefund = resolved.entity;
    } catch (error) {
      return this.handleReadError(error, refund);
    }

    const validation = this.validateProviderRefundEntity(refund, providerRefund);
    if (!validation.ok) {
      await this.auditReview(refund, context, 'mismatch', {
        reason: validation.reason,
      });
      return this.result(refundId, hospitalId, 'mismatch', {
        previousStatus: refund.status,
        message: validation.reason,
      });
    }

    const ownerConflict = await this.findProviderRefundIdConflict(
      refund,
      providerRefund.id,
    );
    if (ownerConflict) {
      await this.auditReview(refund, context, 'mismatch', {
        reason: 'provider_refund_id_conflict',
        conflictingRefundId: ownerConflict.id,
      });
      return this.result(refundId, hospitalId, 'mismatch', {
        previousStatus: refund.status,
        message: 'provider_refund_id_conflict',
        providerRefundId: providerRefund.id,
      });
    }

    const targetStatus = this.mapProviderRefundStatus(providerRefund.status);
    if (targetStatus === 'unchanged') {
      return this.result(refundId, hospitalId, 'no_change', {
        previousStatus: refund.status,
        newStatus: refund.status,
        providerRefundId: providerRefund.id,
        message: 'provider_status_unchanged',
      });
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: refund.paymentId },
      select: { invoiceId: true },
    });

    const now = new Date();
    const applyResult = await this.prisma.$transaction(async (tx) =>
      applyReconciledRefundUpdate(
        tx,
        refund,
        hospitalId,
        {
          status: targetStatus,
          providerRefundId: providerRefund.id,
          providerPaymentId:
            providerRefund.payment_id ?? refund.providerPaymentId,
          failureReason:
            targetStatus === RefundStatus.FAILED
              ? 'Refund failed at provider'
              : null,
          processedAt:
            targetStatus === RefundStatus.SUCCEEDED ? now : undefined,
        },
        this.auditService,
        auditContext,
        payment,
      ),
    );

    return this.result(refundId, hospitalId, 'resolved', {
      previousStatus: refund.status,
      newStatus: applyResult === 'applied' ? targetStatus : refund.status,
      providerRefundId: providerRefund.id,
      providerPaymentId:
        providerRefund.payment_id ?? refund.providerPaymentId,
      message:
        applyResult === 'applied'
          ? 'refund_reconciled'
          : 'concurrent_resolution',
    });
  }

  private async resolveProviderRefund(
    refund: Refund,
  ): Promise<
    | { kind: 'ok'; entity: RefundEntity }
    | { kind: 'no_match' }
    | { kind: 'ambiguous'; candidateIds: string[] }
    | { kind: 'mismatch'; reason: string }
  > {
    if (refund.providerRefundId) {
      try {
        const entity = await this.providerReader.fetchRefund(
          refund.providerPaymentId!,
          refund.providerRefundId,
        );
        return { kind: 'ok', entity };
      } catch (error) {
        if (error instanceof RazorpayReadError && error.kind === 'not_found') {
          return { kind: 'no_match' };
        }
        throw error;
      }
    }

    const listed = await this.providerReader.listRefundsForPayment(
      refund.providerPaymentId!,
    );
    return this.pickRefundFromList(listed, refund);
  }

  private async pickRefundFromList(
    listed: RefundEntity[],
    refund: Refund,
  ): Promise<
    | { kind: 'ok'; entity: RefundEntity }
    | { kind: 'no_match' }
    | { kind: 'ambiguous'; candidateIds: string[] }
    | { kind: 'mismatch'; reason: string }
  > {
    const candidates: RefundEntity[] = [];

    for (const entity of listed) {
      const validation = this.validateProviderRefundEntity(refund, entity);
      if (!validation.ok) {
        continue;
      }
      const conflict = await this.findProviderRefundIdConflict(refund, entity.id);
      if (conflict) {
        continue;
      }
      candidates.push(entity);
    }

    if (candidates.length === 0) {
      return { kind: 'no_match' };
    }
    if (candidates.length > 1) {
      return {
        kind: 'ambiguous',
        candidateIds: candidates.map((row) => row.id),
      };
    }
    return { kind: 'ok', entity: candidates[0]! };
  }

  private validateProviderRefundEntity(
    refund: Refund,
    entity: RefundEntity,
  ): { ok: true } | { ok: false; reason: string } {
    if (!entity.id) {
      return { ok: false, reason: 'provider_refund_missing_id' };
    }

    if (
      refund.providerRefundId &&
      entity.id !== refund.providerRefundId
    ) {
      return { ok: false, reason: 'provider_refund_id_mismatch' };
    }

    if (
      entity.payment_id &&
      refund.providerPaymentId &&
      entity.payment_id !== refund.providerPaymentId
    ) {
      return { ok: false, reason: 'provider_payment_id_mismatch' };
    }

    if (
      !providerAmountsMatch(
        refund.amount,
        entity.amount,
        entity.currency,
        refund.currency,
      )
    ) {
      return { ok: false, reason: 'refund_amount_or_currency_mismatch' };
    }

    return { ok: true };
  }

  private mapProviderRefundStatus(
    status: string | undefined,
  ): RefundStatus | 'unchanged' {
    const normalized = status?.toLowerCase();
    if (normalized === 'processed') {
      return RefundStatus.SUCCEEDED;
    }
    if (normalized === 'failed') {
      return RefundStatus.FAILED;
    }
    if (
      normalized === 'pending' ||
      normalized === 'created' ||
      normalized === 'processing'
    ) {
      return RefundStatus.PROCESSING;
    }
    return 'unchanged';
  }

  private async findProviderRefundIdConflict(
    refund: Refund,
    providerRefundId: string,
  ): Promise<Refund | null> {
    const owner = await this.prisma.refund.findFirst({
      where: {
        provider: PaymentProvider.RAZORPAY,
        providerRefundId,
      },
    });
    if (!owner || owner.id === refund.id) {
      return null;
    }
    return owner;
  }

  private handleReadError(
    error: unknown,
    refund: Refund,
  ): RefundReconciliationResult {
    if (error instanceof RazorpayReadError) {
      if (error.kind === 'retryable') {
        throw error;
      }
      if (error.kind === 'not_found') {
        return this.result(refund.id, refund.hospitalId, 'not_found', {
          previousStatus: refund.status,
          message: error.message,
        });
      }
      throw error;
    }
    throw error;
  }

  private async auditReview(
    refund: Refund,
    context: RefundReconciliationContext,
    outcome: RefundReconciliationOutcome,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.log({
      action: 'REFUND_RECONCILE_REVIEW',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: refund.hospitalId,
      branchId: refund.branchId,
      userId: null,
      metadata: {
        paymentId: refund.paymentId,
        previousStatus: refund.status,
        outcome,
        jobId: context.jobId,
        workerId: context.workerId,
        source: context.source ?? 'background_job',
        ...extra,
      },
    });
  }

  private result(
    refundId: string,
    hospitalId: string,
    outcome: RefundReconciliationOutcome,
    fields: Partial<RefundReconciliationResult> = {},
  ): RefundReconciliationResult {
    return {
      outcome,
      refundId,
      hospitalId,
      ...fields,
    };
  }
}
