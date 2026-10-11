import { BadRequestException } from '@nestjs/common';
import { validateFormularyDispenseLine } from './formulary-dispensing.util';

describe('validateFormularyDispenseLine', () => {
  const defaultProduct = 'prod-default';
  const alternate = 'prod-alt';

  it('allows dispensing the formulary default product', () => {
    expect(() =>
      validateFormularyDispenseLine({
        formularyEntryActive: true,
        defaultPharmacyProductId: defaultProduct,
        dispensedProductId: defaultProduct,
        prescribedProductId: null,
        substitutionReason: null,
        isSubstitution: false,
      }),
    ).not.toThrow();
  });

  it('allows authorized substitution with reason referencing default', () => {
    expect(() =>
      validateFormularyDispenseLine({
        formularyEntryActive: true,
        defaultPharmacyProductId: defaultProduct,
        dispensedProductId: alternate,
        prescribedProductId: defaultProduct,
        substitutionReason: 'Stock unavailable',
        isSubstitution: true,
      }),
    ).not.toThrow();
  });

  it('rejects inactive formulary entry', () => {
    expect(() =>
      validateFormularyDispenseLine({
        formularyEntryActive: false,
        defaultPharmacyProductId: defaultProduct,
        dispensedProductId: defaultProduct,
        prescribedProductId: null,
        substitutionReason: null,
        isSubstitution: false,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects alternate product without substitution metadata', () => {
    expect(() =>
      validateFormularyDispenseLine({
        formularyEntryActive: true,
        defaultPharmacyProductId: defaultProduct,
        dispensedProductId: alternate,
        prescribedProductId: null,
        substitutionReason: null,
        isSubstitution: false,
      }),
    ).toThrow(/authorized substitution/);
  });
});
