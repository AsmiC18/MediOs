import { Prisma } from '@prisma/client';

export function toDecimal(value: number | string | Prisma.Decimal): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  return new Prisma.Decimal(value);
}

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}
