import { BadRequestException } from '@nestjs/common';
import { InsuranceCopayType, Prisma } from '@prisma/client';
import { roundMoney } from '../../billing/utils/money.util';

export type CopayPolicyConfig = {
  copayType: InsuranceCopayType | null;
  copayValue: Prisma.Decimal | null;
};

export function calculateCopaySplit(input: {
  approvedAmount: Prisma.Decimal;
  policy: CopayPolicyConfig;
  overridePatientResponsibility?: Prisma.Decimal;
}): {
  approvedAmount: Prisma.Decimal;
  patientResponsibility: Prisma.Decimal;
  payerResponsibility: Prisma.Decimal;
} {
  const approved = roundMoney(input.approvedAmount);

  if (approved.lessThan(0)) {
    throw new BadRequestException('Approved amount cannot be negative');
  }

  if (input.overridePatientResponsibility != null) {
    const patient = roundMoney(input.overridePatientResponsibility);
    if (patient.lessThan(0)) {
      throw new BadRequestException('Patient responsibility cannot be negative');
    }
    if (patient.greaterThan(approved)) {
      throw new BadRequestException(
        'Patient responsibility cannot exceed approved amount',
      );
    }
    const payer = roundMoney(approved.minus(patient));
    return {
      approvedAmount: approved,
      patientResponsibility: patient,
      payerResponsibility: payer,
    };
  }

  const { copayType, copayValue } = input.policy;

  if (!copayType || copayValue == null) {
    const payer = approved;
    return {
      approvedAmount: approved,
      patientResponsibility: roundMoney(new Prisma.Decimal(0)),
      payerResponsibility: payer,
    };
  }

  let patient: Prisma.Decimal;

  if (copayType === InsuranceCopayType.PERCENTAGE) {
    if (copayValue.lessThan(0) || copayValue.greaterThan(100)) {
      throw new BadRequestException('Co-pay percentage must be between 0 and 100');
    }
    patient = roundMoney(approved.mul(copayValue).div(100));
  } else {
    patient = roundMoney(copayValue);
    if (patient.greaterThan(approved)) {
      patient = approved;
    }
  }

  const payer = roundMoney(approved.minus(patient));
  if (payer.lessThan(0)) {
    throw new BadRequestException('Invalid co-pay calculation');
  }

  const total = roundMoney(patient.plus(payer));
  if (!total.equals(approved)) {
    throw new BadRequestException('Co-pay split does not match approved amount');
  }

  return {
    approvedAmount: approved,
    patientResponsibility: patient,
    payerResponsibility: payer,
  };
}
