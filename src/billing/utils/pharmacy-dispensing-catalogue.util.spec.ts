import {
  buildPharmacyDispensingGstLineItem,
  BillingCatalogueCandidate,
  selectBillingCatalogueForPharmacyDispensing,
} from './pharmacy-dispensing-catalogue.util';

function candidate(
  overrides: Partial<BillingCatalogueCandidate> & Pick<BillingCatalogueCandidate, 'id' | 'code'>,
): BillingCatalogueCandidate {
  return {
    branchId: null,
    gstRate: 0,
    hsnSac: null,
    ...overrides,
  };
}

describe('selectBillingCatalogueForPharmacyDispensing', () => {
  it('returns none when there are no candidates', () => {
    expect(selectBillingCatalogueForPharmacyDispensing([], 'branch-1')).toEqual({
      kind: 'none',
    });
  });

  it('prefers branch-specific catalogue over hospital-wide', () => {
    const branch = candidate({ id: 'b1', code: 'BR-MED', branchId: 'branch-1', gstRate: 12 });
    const wide = candidate({ id: 'w1', code: 'HW-MED', gstRate: 5 });

    const result = selectBillingCatalogueForPharmacyDispensing(
      [wide, branch],
      'branch-1',
    );

    expect(result).toEqual({ kind: 'match', catalogue: branch });
  });

  it('uses hospital-wide when no branch-specific match', () => {
    const wide = candidate({ id: 'w1', code: 'HW-MED', gstRate: 5 });
    const otherBranch = candidate({
      id: 'o1',
      code: 'OT-MED',
      branchId: 'branch-2',
      gstRate: 18,
    });

    const result = selectBillingCatalogueForPharmacyDispensing(
      [otherBranch, wide],
      'branch-1',
    );

    expect(result).toEqual({ kind: 'match', catalogue: wide });
  });

  it('returns ambiguous when multiple hospital-wide rows match', () => {
    const a = candidate({ id: 'a', code: 'MED-A', gstRate: 5 });
    const b = candidate({ id: 'b', code: 'MED-B', gstRate: 5 });

    const result = selectBillingCatalogueForPharmacyDispensing([a, b], null);

    expect(result.kind).toBe('ambiguous');
  });

  it('returns ambiguous when multiple branch-specific rows match', () => {
    const a = candidate({ id: 'a', code: 'MED-A', branchId: 'branch-1', gstRate: 5 });
    const b = candidate({ id: 'b', code: 'MED-B', branchId: 'branch-1', gstRate: 5 });

    const result = selectBillingCatalogueForPharmacyDispensing([a, b], 'branch-1');

    expect(result.kind).toBe('ambiguous');
  });
});

describe('buildPharmacyDispensingGstLineItem', () => {
  it('keeps dispense unit price and applies catalogue tax fields', () => {
    const line = buildPharmacyDispensingGstLineItem({
      productName: 'Paracetamol',
      quantity: 2,
      unitPrice: 25.5,
      sortOrder: 0,
      catalogue: candidate({
        id: 'cat-1',
        code: 'PARA-500',
        gstRate: 12,
        hsnSac: '30049099',
      }),
    });

    expect(line.unitPrice).toBe(25.5);
    expect(line.gstRate).toBe(12);
    expect(line.hsnSac).toBe('30049099');
    expect(line.billingCatalogueItemId).toBe('cat-1');
    expect(line.billingCatalogueCode).toBe('PARA-500');
  });

  it('falls back to zero GST when catalogue is null', () => {
    const line = buildPharmacyDispensingGstLineItem({
      productName: 'Vitamin C',
      quantity: 1,
      unitPrice: 10,
      sortOrder: 0,
      catalogue: null,
    });

    expect(line.gstRate).toBe(0);
    expect(line.hsnSac).toBeUndefined();
    expect(line.billingCatalogueItemId).toBeNull();
  });
});
