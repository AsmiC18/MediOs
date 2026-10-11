import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { roundMoney } from './money.util';

export type InvoiceSplitSnapshot = {
  totalAmount: Prisma.Decimal;
  insurancePatientResponsibilityAmount: Prisma.Decimal | null;
  insurancePayerResponsibilityAmount: Prisma.Decimal | null;
};

export type InvoiceSplitBalances = {
  invoiceTotal: Prisma.Decimal;
  patientPayable: Prisma.Decimal;
  insurerPayable: Prisma.Decimal;
  patientPaid: Prisma.Decimal;
  insurerPaid: Prisma.Decimal;
  patientOutstanding: Prisma.Decimal;
  insurerOutstanding: Prisma.Decimal;
  totalPaid: Prisma.Decimal;
  totalOutstanding: Prisma.Decimal;
};

export function resolvePatientPayableAmount(
  invoice: InvoiceSplitSnapshot,
): Prisma.Decimal {
  if (invoice.insurancePatientResponsibilityAmount != null) {
    return roundMoney(invoice.insurancePatientResponsibilityAmount);
  }
  return roundMoney(invoice.totalAmount);
}

export function resolveInsurerPayableAmount(
  invoice: InvoiceSplitSnapshot,
): Prisma.Decimal {
  if (invoice.insurancePayerResponsibilityAmount != null) {
    return roundMoney(invoice.insurancePayerResponsibilityAmount);
  }
  return new Prisma.Decimal(0);
}

export function assertSplitResponsibilityTotals(invoice: InvoiceSplitSnapshot): void {
  if (
    invoice.insurancePatientResponsibilityAmount == null &&
    invoice.insurancePayerResponsibilityAmount == null
  ) {
    return;
  }

  if (
    invoice.insurancePatientResponsibilityAmount == null ||
    invoice.insurancePayerResponsibilityAmount == null
  ) {
    throw new BadRequestException(
      'Invoice insurance split requires both patient and payer responsibility amounts',
    );
  }

  const total = roundMoney(invoice.totalAmount);
  const splitTotal = roundMoney(
    invoice.insurancePatientResponsibilityAmount.plus(
      invoice.insurancePayerResponsibilityAmount,
    ),
  );

  if (!splitTotal.equals(total)) {
    throw new BadRequestException(
      'Patient and insurer responsibility must sum to invoice total',
    );
  }
}

export function computeInvoiceSplitBalances(input: {
  invoice: InvoiceSplitSnapshot;
  patientPaidNet: Prisma.Decimal;
  insurerPaidNet: Prisma.Decimal;
}): InvoiceSplitBalances {
  assertSplitResponsibilityTotals(input.invoice);

  const invoiceTotal = roundMoney(input.invoice.totalAmount);
  const patientPayable = resolvePatientPayableAmount(input.invoice);
  const insurerPayable = resolveInsurerPayableAmount(input.invoice);

  const patientPaid = roundMoney(
    Prisma.Decimal.max(input.patientPaidNet, new Prisma.Decimal(0)),
  );
  const insurerPaid = roundMoney(
    Prisma.Decimal.max(input.insurerPaidNet, new Prisma.Decimal(0)),
  );

  const patientOutstanding = roundMoney(
    Prisma.Decimal.max(patientPayable.minus(patientPaid), new Prisma.Decimal(0)),
  );
  const insurerOutstanding = roundMoney(
    Prisma.Decimal.max(insurerPayable.minus(insurerPaid), new Prisma.Decimal(0)),
  );

  const totalPaid = roundMoney(patientPaid.plus(insurerPaid));
  const totalOutstanding = roundMoney(
    patientOutstanding.plus(insurerOutstanding),
  );

  return {
    invoiceTotal,
    patientPayable,
    insurerPayable,
    patientPaid,
    insurerPaid,
    patientOutstanding,
    insurerOutstanding,
    totalPaid,
    totalOutstanding,
  };
}
