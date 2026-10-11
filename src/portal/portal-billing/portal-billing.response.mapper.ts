import { InvoiceStatus, PaymentStatus, Prisma } from '@prisma/client';
import { resolvePatientPayableAmount } from '../../billing/utils/invoice-split-payer.util';
import { roundMoney } from '../../billing/utils/money.util';

type InvoiceWithItems = Prisma.InvoiceGetPayload<{
  include: {
    items: true;
  };
}>;

function formatMoney(amount: Prisma.Decimal): string {
  return roundMoney(amount).toFixed(2);
}

export function resolvePatientCollectibleAmount(invoice: {
  totalAmount: Prisma.Decimal;
  insurancePatientResponsibilityAmount: Prisma.Decimal | null;
  insurancePayerResponsibilityAmount?: Prisma.Decimal | null;
}): Prisma.Decimal {
  return resolvePatientPayableAmount({
    totalAmount: invoice.totalAmount,
    insurancePatientResponsibilityAmount:
      invoice.insurancePatientResponsibilityAmount,
    insurancePayerResponsibilityAmount:
      invoice.insurancePayerResponsibilityAmount ?? null,
  });
}

export function mapPortalInvoiceSummary(
  invoice: InvoiceWithItems,
  paidAmount: Prisma.Decimal,
) {
  const collectible = resolvePatientCollectibleAmount(invoice);
  const paid = roundMoney(paidAmount);
  const balanceDue =
    invoice.status === InvoiceStatus.PAID
      ? new Prisma.Decimal(0)
      : roundMoney(collectible.minus(paid));

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency,
    branchId: invoice.branchId,
    subtotalAmount: formatMoney(invoice.subtotalAmount),
    taxAmount: formatMoney(invoice.taxAmount),
    totalAmount: formatMoney(invoice.totalAmount),
    collectibleAmount: formatMoney(collectible),
    paidAmount: formatMoney(paid),
    balanceDue: formatMoney(balanceDue),
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
    itemCount: invoice.items.length,
  };
}

export function mapPortalInvoiceDetail(
  invoice: InvoiceWithItems,
  paidAmount: Prisma.Decimal,
) {
  const summary = mapPortalInvoiceSummary(invoice, paidAmount);
  return {
    ...summary,
    notes: invoice.notes,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: formatMoney(item.unitPrice),
      lineTotal: formatMoney(item.lineTotal),
      lineTotalWithTax: formatMoney(item.lineTotalWithTax),
      gstRate: item.gstRate.toFixed(2),
    })),
  };
}

export function mapPortalPayment(payment: {
  id: string;
  invoiceId: string;
  status: PaymentStatus;
  amount: Prisma.Decimal;
  currency: string;
  failureReason: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: payment.id,
    invoiceId: payment.invoiceId,
    status: payment.status,
    amount: formatMoney(payment.amount),
    currency: payment.currency,
    failureReason: payment.failureReason,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

export function mapPortalPaymentInitiation(result: {
  paymentId: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  paymentLinkUrl: string | null;
}) {
  return {
    paymentId: result.paymentId,
    status: result.status,
    amount: result.amount,
    currency: result.currency,
    paymentLinkUrl: result.paymentLinkUrl,
  };
}
