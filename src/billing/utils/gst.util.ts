import { GstSupplyType, Prisma } from '@prisma/client';
import { roundMoney, toDecimal } from './money.util';

export const GSTIN_PATTERN =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const STATE_CODE_PATTERN = /^(0[1-9]|[1-3][0-7])$/;

export type GstItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  hsnSac?: string;
  gstRate?: number;
  sortOrder?: number;
};

export type ComputedGstItem = {
  hospitalId: string;
  description: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  hsnSac: string | null;
  gstRate: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  cgstRate: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstRate: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstRate: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  lineTotalWithTax: Prisma.Decimal;
  sortOrder: number;
};

export type ComputedGstInvoiceTotals = {
  computedItems: ComputedGstItem[];
  subtotalAmount: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

export function validateStateCode(stateCode: string): boolean {
  return STATE_CODE_PATTERN.test(stateCode);
}

export function validateGstin(gstin: string): boolean {
  return GSTIN_PATTERN.test(gstin);
}

export function resolveSupplyType(
  supplierStateCode: string,
  placeOfSupplyStateCode: string,
): GstSupplyType {
  return supplierStateCode === placeOfSupplyStateCode
    ? GstSupplyType.INTRA_STATE
    : GstSupplyType.INTER_STATE;
}

export function computeGstInvoice(
  items: GstItemInput[],
  hospitalId: string,
  supplyType: GstSupplyType | null,
): ComputedGstInvoiceTotals {
  let subtotalAmount = toDecimal(0);
  let cgstAmount = toDecimal(0);
  let sgstAmount = toDecimal(0);
  let igstAmount = toDecimal(0);

  const computedItems = items.map((item, index) => {
    const unitPrice = roundMoney(toDecimal(item.unitPrice));
    const taxableAmount = roundMoney(unitPrice.mul(item.quantity));
    const gstRate = roundMoney(toDecimal(item.gstRate ?? 0));

    let cgstRate = toDecimal(0);
    let sgstRate = toDecimal(0);
    let igstRate = toDecimal(0);
    let itemCgstAmount = toDecimal(0);
    let itemSgstAmount = toDecimal(0);
    let itemIgstAmount = toDecimal(0);

    if (gstRate.gt(0) && supplyType) {
      if (supplyType === GstSupplyType.INTRA_STATE) {
        cgstRate = roundMoney(gstRate.div(2));
        sgstRate = roundMoney(gstRate.div(2));
        itemCgstAmount = roundMoney(taxableAmount.mul(cgstRate).div(100));
        itemSgstAmount = roundMoney(taxableAmount.mul(sgstRate).div(100));
      } else {
        igstRate = gstRate;
        itemIgstAmount = roundMoney(taxableAmount.mul(igstRate).div(100));
      }
    }

    const lineTotalWithTax = roundMoney(
      taxableAmount.add(itemCgstAmount).add(itemSgstAmount).add(itemIgstAmount),
    );

    subtotalAmount = subtotalAmount.add(taxableAmount);
    cgstAmount = cgstAmount.add(itemCgstAmount);
    sgstAmount = sgstAmount.add(itemSgstAmount);
    igstAmount = igstAmount.add(itemIgstAmount);

    return {
      hospitalId,
      description: item.description,
      quantity: item.quantity,
      unitPrice,
      lineTotal: taxableAmount,
      hsnSac: item.hsnSac ?? null,
      gstRate,
      taxableAmount,
      cgstRate,
      cgstAmount: itemCgstAmount,
      sgstRate,
      sgstAmount: itemSgstAmount,
      igstRate,
      igstAmount: itemIgstAmount,
      lineTotalWithTax,
      sortOrder: item.sortOrder ?? index,
    };
  });

  subtotalAmount = roundMoney(subtotalAmount);
  cgstAmount = roundMoney(cgstAmount);
  sgstAmount = roundMoney(sgstAmount);
  igstAmount = roundMoney(igstAmount);
  const taxAmount = roundMoney(cgstAmount.add(sgstAmount).add(igstAmount));
  const totalAmount = roundMoney(subtotalAmount.add(taxAmount));

  return {
    computedItems,
    subtotalAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxAmount,
    totalAmount,
  };
}

export function hasTaxedItems(items: GstItemInput[]): boolean {
  return items.some((item) => (item.gstRate ?? 0) > 0);
}
