import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { roundMoney, toDecimal } from '../../billing/utils/money.util';

export function resolveClaimAmounts(input: {
  claimedAmount: Prisma.Decimal;
  approvedAmount: Prisma.Decimal;
  patientResponsibility?: Prisma.Decimal;
}): { approvedAmount: Prisma.Decimal; patientResponsibility: Prisma.Decimal } {
  const claimed = roundMoney(input.claimedAmount);
  const approved = roundMoney(input.approvedAmount);

  if (approved.lessThan(0)) {
    throw new BadRequestException('Approved amount cannot be negative');
  }

  if (approved.greaterThan(claimed)) {
    throw new BadRequestException('Approved amount cannot exceed claimed amount');
  }

  let patientResponsibility = input.patientResponsibility
    ? roundMoney(input.patientResponsibility)
    : roundMoney(claimed.minus(approved));

  if (patientResponsibility.lessThan(0)) {
    throw new BadRequestException('Patient responsibility cannot be negative');
  }

  const total = roundMoney(approved.plus(patientResponsibility));
  if (total.greaterThan(claimed)) {
    throw new BadRequestException(
      'Approved amount plus patient responsibility cannot exceed claimed amount',
    );
  }

  return { approvedAmount: approved, patientResponsibility };
}

export function parseMoney(value: number): Prisma.Decimal {
  if (value < 0) {
    throw new BadRequestException('Amount cannot be negative');
  }

  return roundMoney(toDecimal(value));
}
