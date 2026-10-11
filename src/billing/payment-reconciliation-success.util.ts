import { Invoice, Payment, PaymentStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { roundMoney } from './utils/money.util';
import { PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES } from './payment-reconciliation.types';

export type PaymentSuccessProviderIds = {
  providerPaymentId?: string | null;
  providerOrderId?: string | null;
  providerPaymentLinkId?: string | null;
};

function formatAmount(amount: Prisma.Decimal): string {
  return roundMoney(amount).toFixed(2);
}

/**
 * Applies the same DB transitions as a successful payment webhook
 * (conditional payment update + optional invoice PAID + audits).
 */
export async function applyReconciledPaymentSuccess(
  tx: Prisma.TransactionClient,
  payment: Payment,
  invoice: Invoice,
  providerIds: PaymentSuccessProviderIds,
  auditService: AuditService,
  splitPayerService: InvoiceSplitPayerService,
  auditContext: {
    jobId?: string;
    workerId?: string;
    source: 'background_job';
  },
): Promise<'applied' | 'ignored'> {
  const now = new Date();
  const providerPaymentId =
    providerIds.providerPaymentId ?? payment.providerPaymentId;
  const providerOrderId = providerIds.providerOrderId ?? payment.providerOrderId;
  const providerPaymentLinkId =
    providerIds.providerPaymentLinkId ?? payment.providerPaymentLinkId;

  const updated = await tx.payment.updateMany({
    where: {
      id: payment.id,
      status: {
        in: PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES,
      },
    },
    data: {
      status: PaymentStatus.SUCCEEDED,
      providerPaymentId,
      providerOrderId,
      providerPaymentLinkId,
      paidAt: now,
      failureReason: null,
    },
  });

  if (updated.count === 0) {
    return 'ignored';
  }

  await splitPayerService.syncInvoiceSettlementStatus(tx, invoice, {
    source: 'razorpay',
    paymentId: payment.id,
    jobId: auditContext.jobId,
    workerId: auditContext.workerId,
    reconcileSource: auditContext.source,
  });

  await auditService.log({
    action: 'PAYMENT_SUCCEEDED',
    entity: 'Payment',
    entityId: payment.id,
    hospitalId: payment.hospitalId,
    branchId: payment.branchId,
    userId: null,
    metadata: {
      invoiceId: payment.invoiceId,
      providerPaymentId,
      amount: formatAmount(payment.amount),
      ...auditContext,
    },
  });

  await auditService.log({
    action: 'PAYMENT_RECONCILED',
    entity: 'Payment',
    entityId: payment.id,
    hospitalId: payment.hospitalId,
    branchId: payment.branchId,
    userId: null,
    metadata: {
      invoiceId: payment.invoiceId,
      providerPaymentLinkId,
      providerPaymentId,
      previousStatus: payment.status,
      newStatus: PaymentStatus.SUCCEEDED,
      outcome: 'resolved',
      ...auditContext,
    },
  });

  return 'applied';
}

export async function applyReconciledPaymentPending(
  tx: Prisma.TransactionClient,
  payment: Payment,
  providerPaymentLinkId: string,
  auditService: AuditService,
  auditContext: {
    jobId?: string;
    workerId?: string;
    source: 'background_job';
  },
): Promise<'applied' | 'ignored'> {
  const updated = await tx.payment.updateMany({
    where: {
      id: payment.id,
      status: {
        in: PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES,
      },
    },
    data: {
      status: PaymentStatus.PENDING,
      providerPaymentLinkId,
      failureReason: null,
    },
  });

  if (updated.count === 0) {
    return 'ignored';
  }

  await auditService.log({
    action: 'PAYMENT_RECONCILED',
    entity: 'Payment',
    entityId: payment.id,
    hospitalId: payment.hospitalId,
    branchId: payment.branchId,
    userId: null,
    metadata: {
      invoiceId: payment.invoiceId,
      providerPaymentLinkId,
      previousStatus: payment.status,
      newStatus: PaymentStatus.PENDING,
      outcome: 'resolved',
      ...auditContext,
    },
  });

  return 'applied';
}

export async function applyReconciledPaymentFailed(
  tx: Prisma.TransactionClient,
  payment: Payment,
  failureReason: string,
  providerIds: PaymentSuccessProviderIds,
  auditService: AuditService,
  auditContext: {
    jobId?: string;
    workerId?: string;
    source: 'background_job';
  },
): Promise<'applied' | 'ignored'> {
  const updated = await tx.payment.updateMany({
    where: {
      id: payment.id,
      status: {
        in: PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES,
      },
    },
    data: {
      status: PaymentStatus.FAILED,
      failureReason: failureReason.slice(0, 500),
      providerPaymentId:
        providerIds.providerPaymentId ?? payment.providerPaymentId,
      providerOrderId: providerIds.providerOrderId ?? payment.providerOrderId,
      providerPaymentLinkId:
        providerIds.providerPaymentLinkId ?? payment.providerPaymentLinkId,
    },
  });

  if (updated.count === 0) {
    return 'ignored';
  }

  await auditService.log({
    action: 'PAYMENT_FAILED',
    entity: 'Payment',
    entityId: payment.id,
    hospitalId: payment.hospitalId,
    branchId: payment.branchId,
    userId: null,
    metadata: {
      invoiceId: payment.invoiceId,
      failureReason: failureReason.slice(0, 500),
      ...auditContext,
    },
  });

  await auditService.log({
    action: 'PAYMENT_RECONCILED',
    entity: 'Payment',
    entityId: payment.id,
    hospitalId: payment.hospitalId,
    branchId: payment.branchId,
    userId: null,
    metadata: {
      invoiceId: payment.invoiceId,
      previousStatus: payment.status,
      newStatus: PaymentStatus.FAILED,
      outcome: 'resolved',
      ...auditContext,
    },
  });

  return 'applied';
}
