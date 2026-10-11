import { NotFoundException } from '@nestjs/common';
import { Invoice, InvoiceStatus, Prisma } from '@prisma/client';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { computeInvoiceSplitBalances } from './utils/invoice-split-payer.util';

export function createMockInvoiceSplitPayerService(options?: {
  syncMarksPaid?: boolean;
}): InvoiceSplitPayerService {
  const syncMarksPaid = options?.syncMarksPaid ?? false;

  return {
    computeBalancesForInvoice: jest.fn(async (invoice: Invoice) =>
      computeInvoiceSplitBalances({
        invoice,
        patientPaidNet: new Prisma.Decimal(0),
        insurerPaidNet: new Prisma.Decimal(0),
      }),
    ),
    resolvePatientCollectible: jest.fn((invoice: Invoice) => invoice.totalAmount),
    lockInvoiceForUpdate: jest.fn(
      async (
        tx: { invoice: { findFirst: (args: unknown) => Promise<Invoice | null> } },
        invoiceId: string,
        hospitalId: string,
      ) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: invoiceId, hospitalId },
        });
        if (!invoice) {
          throw new NotFoundException('Invoice not found');
        }
        return invoice;
      },
    ),    sumNetPaidByPayer: jest.fn(),
    syncInvoiceSettlementStatus: jest.fn(
      async (tx: Prisma.TransactionClient, invoice: Invoice) => {
        if (syncMarksPaid && invoice.status === InvoiceStatus.ISSUED) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: InvoiceStatus.PAID, paidAt: new Date() },
          });
        }
        return invoice;
      },
    ),
  } as unknown as InvoiceSplitPayerService;
}
