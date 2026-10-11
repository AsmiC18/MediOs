import { Prisma } from '@prisma/client';
import {
  computeInvoiceSplitBalances,
  resolveInsurerPayableAmount,
  resolvePatientPayableAmount,
} from './invoice-split-payer.util';

describe('invoice split payer util', () => {
  const invoice = {
    totalAmount: new Prisma.Decimal('10000.00'),
    insurancePatientResponsibilityAmount: new Prisma.Decimal('3000.00'),
    insurancePayerResponsibilityAmount: new Prisma.Decimal('7000.00'),
  };

  it('uses full total when no insurance split', () => {
    expect(
      resolvePatientPayableAmount({
        totalAmount: new Prisma.Decimal('500'),
        insurancePatientResponsibilityAmount: null,
        insurancePayerResponsibilityAmount: null,
      }).toFixed(2),
    ).toBe('500.00');
    expect(
      resolveInsurerPayableAmount({
        totalAmount: new Prisma.Decimal('500'),
        insurancePatientResponsibilityAmount: null,
        insurancePayerResponsibilityAmount: null,
      }).toFixed(2),
    ).toBe('0.00');
  });

  it('computes partial settlement balances', () => {
    const balances = computeInvoiceSplitBalances({
      invoice,
      patientPaidNet: new Prisma.Decimal('3000'),
      insurerPaidNet: new Prisma.Decimal('5000'),
    });

    expect(balances.patientPaid.toFixed(2)).toBe('3000.00');
    expect(balances.insurerPaid.toFixed(2)).toBe('5000.00');
    expect(balances.patientOutstanding.toFixed(2)).toBe('0.00');
    expect(balances.insurerOutstanding.toFixed(2)).toBe('2000.00');
    expect(balances.totalPaid.toFixed(2)).toBe('8000.00');
    expect(balances.totalOutstanding.toFixed(2)).toBe('2000.00');
  });

  it('fully settles when both payers complete', () => {
    const balances = computeInvoiceSplitBalances({
      invoice,
      patientPaidNet: new Prisma.Decimal('3000'),
      insurerPaidNet: new Prisma.Decimal('7000'),
    });
    expect(balances.totalOutstanding.toFixed(2)).toBe('0.00');
  });
});
