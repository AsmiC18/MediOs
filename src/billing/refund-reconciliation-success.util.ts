import { Payment, Refund, RefundStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { roundMoney } from './utils/money.util';
import { REFUND_RECONCILIATION_RESOLVABLE_STATUSES } from './refund-reconciliation.types';

function formatAmount(amount: Prisma.Decimal): string {
  return roundMoney(amount).toFixed(2);
}

export type RefundReconcileAuditContext = {
  jobId?: string;
  workerId?: string;
  source: 'background_job';
};

export async function applyReconciledRefundUpdate(
  tx: Prisma.TransactionClient,
  refund: Refund,
  hospitalId: string,
  data: {
    status: RefundStatus;
    providerRefundId?: string | null;
    providerPaymentId?: string | null;
    failureReason?: string | null;
    processedAt?: Date | null;
  },
  auditService: AuditService,
  auditContext: RefundReconcileAuditContext,
  payment?: Pick<Payment, 'invoiceId'> | null,
): Promise<'applied' | 'ignored'> {
  const updated = await tx.refund.updateMany({
    where: {
      id: refund.id,
      hospitalId,
      status: {
        in: REFUND_RECONCILIATION_RESOLVABLE_STATUSES,
      },
    },
    data: {
      status: data.status,
      ...(data.providerRefundId != null
        ? { providerRefundId: data.providerRefundId }
        : {}),
      ...(data.providerPaymentId != null
        ? { providerPaymentId: data.providerPaymentId }
        : {}),
      ...(data.failureReason != null ? { failureReason: data.failureReason } : {}),
      ...(data.processedAt != null ? { processedAt: data.processedAt } : {}),
    },
  });

  if (updated.count === 0) {
    return 'ignored';
  }

  if (data.status === RefundStatus.SUCCEEDED) {
    await auditService.log({
      action: 'REFUND_SUCCEEDED',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: refund.hospitalId,
      branchId: refund.branchId,
      userId: null,
      metadata: {
        paymentId: refund.paymentId,
        invoiceId: payment?.invoiceId,
        amount: formatAmount(refund.amount),
        providerRefundId: data.providerRefundId ?? refund.providerRefundId,
        ...auditContext,
      },
    });
  }

  if (data.status === RefundStatus.FAILED) {
    await auditService.log({
      action: 'REFUND_FAILED',
      entity: 'Refund',
      entityId: refund.id,
      hospitalId: refund.hospitalId,
      branchId: refund.branchId,
      userId: null,
      metadata: {
        paymentId: refund.paymentId,
        invoiceId: payment?.invoiceId,
        amount: formatAmount(refund.amount),
        failureReason: data.failureReason ?? undefined,
        ...auditContext,
      },
    });
  }

  await auditService.log({
    action: 'REFUND_RECONCILED',
    entity: 'Refund',
    entityId: refund.id,
    hospitalId: refund.hospitalId,
    branchId: refund.branchId,
    userId: null,
    metadata: {
      paymentId: refund.paymentId,
      invoiceId: payment?.invoiceId,
      providerRefundId: data.providerRefundId ?? refund.providerRefundId,
      providerPaymentId: data.providerPaymentId ?? refund.providerPaymentId,
      previousStatus: refund.status,
      newStatus: data.status,
      outcome: 'resolved',
      ...auditContext,
    },
  });

  return 'applied';
}
