import { GstSupplyType, Prisma } from '@prisma/client';

import { roundMoney, toDecimal } from './money.util';



export const GSTIN_PATTERN =

  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;



export const STATE_CODE_PATTERN = /^(0[1-9]|[1-3][0-7])$/;



/** Same rule as CreateInvoiceItemDto — 4–8 alphanumeric HSN/SAC. */

export const HSN_SAC_PATTERN = /^[0-9A-Za-z]{4,8}$/;



export type GstItemInput = {

  description: string;

  quantity: number;

  unitPrice: number;

  hsnSac?: string;

  gstRate?: number;

  sortOrder?: number;

  billingCatalogueItemId?: string | null;

  billingCatalogueCode?: string | null;

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

  billingCatalogueItemId: string | null;

  billingCatalogueCode: string | null;

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



export class TaxedLineHsnSacError extends Error {

  constructor(message: string) {

    super(message);

    this.name = 'TaxedLineHsnSacError';

  }

}



export function isTaxedGstRate(gstRate?: number | null): boolean {

  return (gstRate ?? 0) > 0;

}



export function isValidHsnSacValue(hsnSac: string | null | undefined): boolean {

  if (hsnSac == null) {

    return false;

  }

  const trimmed = hsnSac.trim();

  return trimmed.length > 0 && HSN_SAC_PATTERN.test(trimmed);

}



export function normalizeHsnSac(hsnSac: string): string {

  return hsnSac.trim();

}



/**

 * Server-side rule: gstRate > 0 requires a valid HSN/SAC on every line.

 */

export function assertGstItemsHaveValidHsnSac(

  items: Array<{

    hsnSac?: string | null;

    gstRate?: number | null;

    description?: string;

  }>,

): void {

  for (const item of items) {

    if (!isTaxedGstRate(item.gstRate)) {

      continue;

    }



    if (!isValidHsnSacValue(item.hsnSac)) {

      const label = item.description ? ` (${item.description})` : '';

      throw new TaxedLineHsnSacError(

        `HSN/SAC is required and must be 4–8 alphanumeric characters for taxed invoice lines${label}`,

      );

    }

  }

}



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

  assertGstItemsHaveValidHsnSac(items);



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



    const hsnSac =

      isTaxedGstRate(item.gstRate) && item.hsnSac

        ? normalizeHsnSac(item.hsnSac)

        : item.hsnSac?.trim()

          ? normalizeHsnSac(item.hsnSac)

          : null;



    return {

      hospitalId,

      description: item.description,

      quantity: item.quantity,

      unitPrice,

      lineTotal: taxableAmount,

      hsnSac,

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

      billingCatalogueItemId: item.billingCatalogueItemId ?? null,

      billingCatalogueCode: item.billingCatalogueCode ?? null,

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

  return items.some((item) => isTaxedGstRate(item.gstRate));

}


