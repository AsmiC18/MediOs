import { Prisma } from '@prisma/client';
import { roundMoney, toDecimal } from './money.util';

export function normalizeProviderAmountPaise(amountPaise: number): Prisma.Decimal {
  return roundMoney(toDecimal(amountPaise).div(100));
}

/** Matches MediOS billing payment webhook amount verification (paise → decimal). */
export function providerAmountsMatch(
  expectedAmount: Prisma.Decimal,
  providerAmountPaise: number | undefined,
  providerCurrency: string | undefined,
  expectedCurrency: string,
): boolean {
  if (providerAmountPaise == null) {
    return false;
  }

  if (!providerCurrency) {
    return false;
  }

  if (providerCurrency.toUpperCase() !== expectedCurrency.toUpperCase()) {
    return false;
  }

  const providerAmount = normalizeProviderAmountPaise(providerAmountPaise);
  return providerAmount.equals(roundMoney(expectedAmount));
}
