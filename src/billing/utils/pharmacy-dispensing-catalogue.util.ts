import { GstItemInput } from './gst.util';

export type BillingCatalogueCandidate = {
  id: string;
  code: string;
  branchId: string | null;
  gstRate: number;
  hsnSac: string | null;
};

export type SelectBillingCatalogueResult =
  | { kind: 'match'; catalogue: BillingCatalogueCandidate }
  | { kind: 'none' }
  | { kind: 'ambiguous'; message: string };

/**
 * Picks at most one active billing catalogue row for a dispensed product.
 * Branch-specific rows beat hospital-wide (branchId null). Never matches another branch.
 */
export function selectBillingCatalogueForPharmacyDispensing(
  candidates: BillingCatalogueCandidate[],
  dispensingBranchId: string | null,
): SelectBillingCatalogueResult {
  if (candidates.length === 0) {
    return { kind: 'none' };
  }

  if (dispensingBranchId) {
    const branchMatches = candidates.filter(
      (c) => c.branchId === dispensingBranchId,
    );
    if (branchMatches.length > 1) {
      return {
        kind: 'ambiguous',
        message:
          'Multiple active billing catalogue items match this pharmacy product for the dispensing branch',
      };
    }
    if (branchMatches.length === 1) {
      return { kind: 'match', catalogue: branchMatches[0]! };
    }
  }

  const hospitalWide = candidates.filter((c) => c.branchId === null);
  if (hospitalWide.length > 1) {
    return {
      kind: 'ambiguous',
      message:
        'Multiple active hospital-wide billing catalogue items match this pharmacy product',
    };
  }
  if (hospitalWide.length === 1) {
    return { kind: 'match', catalogue: hospitalWide[0]! };
  }

  return { kind: 'none' };
}

export function buildPharmacyDispensingGstLineItem(input: {
  productName: string;
  quantity: number;
  unitPrice: number;
  sortOrder: number;
  catalogue: BillingCatalogueCandidate | null;
}): GstItemInput {
  const catalogue = input.catalogue;

  return {
    description: `Pharmacy: ${input.productName}`,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    gstRate: catalogue ? catalogue.gstRate : 0,
    hsnSac: catalogue?.hsnSac ?? undefined,
    sortOrder: input.sortOrder,
    billingCatalogueItemId: catalogue?.id ?? null,
    billingCatalogueCode: catalogue?.code ?? null,
  };
}
