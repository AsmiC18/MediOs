import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Invoice,
  InvoiceStatus,
  PaymentPayerType,
  PaymentStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  computeInvoiceSplitBalances,
  InvoiceSplitBalances,
  resolvePatientPayableAmount,
} from './utils/invoice-split-payer.util';
import { roundMoney } from './utils/money.util';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class InvoiceSplitPayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private client(db?: DbClient): DbClient {
    return db ?? this.prisma;
  }

  async lockInvoiceForUpdate(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    hospitalId: string,
  ): Promise<Invoice> {
    const rows = await tx.$queryRaw<Invoice[]>`
      SELECT * FROM "Invoice"
      WHERE "id" = ${invoiceId} AND "hospitalId" = ${hospitalId}
      FOR UPDATE
    `;
    const invoice = rows[0];
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async sumNetPaidByPayer(
    db: DbClient,
    invoiceId: string,
    hospitalId: string,
  ): Promise<{ patient: Prisma.Decimal; insurer: Prisma.Decimal }> {
    const payments = await db.payment.findMany({
      where: {
        invoiceId,
        hospitalId,
        status: PaymentStatus.SUCCEEDED,
      },
      select: {
        id: true,
        payerType: true,
        amount: true,
      },
    });

    if (payments.length === 0) {
      return {
        patient: new Prisma.Decimal(0),
        insurer: new Prisma.Decimal(0),
      };
    }

    const paymentIds = payments.map((p) => p.id);
    const refunds = await db.refund.findMany({
      where: {
        paymentId: { in: paymentIds },
        hospitalId,
        status: RefundStatus.SUCCEEDED,
      },
      select: {
        paymentId: true,
        amount: true,
      },
    });

    const refundByPayment = new Map<string, Prisma.Decimal>();
    for (const refund of refunds) {
      const prev = refundByPayment.get(refund.paymentId) ?? new Prisma.Decimal(0);
      refundByPayment.set(
        refund.paymentId,
        roundMoney(prev.plus(refund.amount)),
      );
    }

    let patient = new Prisma.Decimal(0);
    let insurer = new Prisma.Decimal(0);

    for (const payment of payments) {
      const refunded = refundByPayment.get(payment.id) ?? new Prisma.Decimal(0);
      const net = roundMoney(payment.amount.minus(refunded));
      if (net.lessThanOrEqualTo(0)) {
        continue;
      }
      if (payment.payerType === PaymentPayerType.INSURER) {
        insurer = roundMoney(insurer.plus(net));
      } else {
        patient = roundMoney(patient.plus(net));
      }
    }

    return { patient, insurer };
  }

  async computeBalancesForInvoice(
    invoice: Invoice,
    db?: DbClient,
  ): Promise<InvoiceSplitBalances> {
    const paid = await this.sumNetPaidByPayer(
      this.client(db),
      invoice.id,
      invoice.hospitalId,
    );

    return computeInvoiceSplitBalances({
      invoice,
      patientPaidNet: paid.patient,
      insurerPaidNet: paid.insurer,
    });
  }

  resolvePatientCollectible(invoice: Invoice): Prisma.Decimal {
    return resolvePatientPayableAmount(invoice);
  }

  async syncInvoiceSettlementStatus(
    tx: Prisma.TransactionClient,
    invoice: Invoice,
    auditMetadata?: Record<string, unknown>,
  ): Promise<Invoice> {
    const balances = await this.computeBalancesForInvoice(invoice, tx);

    if (
      balances.totalOutstanding.greaterThan(0) &&
      invoice.status === InvoiceStatus.PAID
    ) {
      const reopened = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.ISSUED,
          paidAt: null,
        },
      });

      await this.auditService.log({
        action: 'INVOICE_STATUS_CHANGED',
        entity: 'Invoice',
        entityId: invoice.id,
        hospitalId: invoice.hospitalId,
        branchId: invoice.branchId,
        userId: null,
        metadata: {
          from: InvoiceStatus.PAID,
          to: InvoiceStatus.ISSUED,
          reason: 'split_payer_outstanding',
          ...auditMetadata,
        },
      });

      return reopened;
    }

    if (
      balances.totalOutstanding.equals(0) &&
      invoice.status === InvoiceStatus.ISSUED
    ) {
      const now = new Date();
      const paid = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          paidAt: now,
        },
      });

      await this.auditService.log({
        action: 'INVOICE_STATUS_CHANGED',
        entity: 'Invoice',
        entityId: invoice.id,
        hospitalId: invoice.hospitalId,
        branchId: invoice.branchId,
        userId: null,
        metadata: {
          from: InvoiceStatus.ISSUED,
          to: InvoiceStatus.PAID,
          reason: 'split_payer_fully_settled',
          totalPaid: balances.totalPaid.toFixed(2),
          ...auditMetadata,
        },
      });

      return paid;
    }

    return invoice;
  }
}
