import { InsuranceCopayType, Prisma } from '@prisma/client';
import { calculateCopaySplit } from './copay.util';

describe('calculateCopaySplit', () => {
  const approved = new Prisma.Decimal('1000.00');

  it('returns full payer when no co-pay configured', () => {
    const split = calculateCopaySplit({
      approvedAmount: approved,
      policy: { copayType: null, copayValue: null },
    });
    expect(split.patientResponsibility.toFixed(2)).toBe('0.00');
    expect(split.payerResponsibility.toFixed(2)).toBe('1000.00');
  });

  it('applies percentage co-pay', () => {
    const split = calculateCopaySplit({
      approvedAmount: approved,
      policy: {
        copayType: InsuranceCopayType.PERCENTAGE,
        copayValue: new Prisma.Decimal('20'),
      },
    });
    expect(split.patientResponsibility.toFixed(2)).toBe('200.00');
    expect(split.payerResponsibility.toFixed(2)).toBe('800.00');
  });

  it('caps fixed co-pay at approved amount', () => {
    const split = calculateCopaySplit({
      approvedAmount: new Prisma.Decimal('500'),
      policy: {
        copayType: InsuranceCopayType.FIXED,
        copayValue: new Prisma.Decimal('900'),
      },
    });
    expect(split.patientResponsibility.toFixed(2)).toBe('500.00');
    expect(split.payerResponsibility.toFixed(2)).toBe('0.00');
  });

  it('respects override patient responsibility', () => {
    const split = calculateCopaySplit({
      approvedAmount: approved,
      policy: {
        copayType: InsuranceCopayType.PERCENTAGE,
        copayValue: new Prisma.Decimal('10'),
      },
      overridePatientResponsibility: new Prisma.Decimal('150'),
    });
    expect(split.patientResponsibility.toFixed(2)).toBe('150.00');
    expect(split.payerResponsibility.toFixed(2)).toBe('850.00');
  });
});
