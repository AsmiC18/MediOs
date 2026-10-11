import { BadRequestException } from '@nestjs/common';
import { resolveSubstitutionFields } from './substitution.util';

describe('resolveSubstitutionFields', () => {
  it('allows normal dispensing without substitution metadata', () => {
    expect(
      resolveSubstitutionFields({
        productId: 'prod-a',
      }),
    ).toEqual({
      isSubstitution: false,
      prescribedProductId: null,
      substitutionReason: null,
    });
  });

  it('requires reason when prescribed product differs', () => {
    expect(() =>
      resolveSubstitutionFields({
        productId: 'prod-b',
        prescribedProductId: 'prod-a',
      }),
    ).toThrow(BadRequestException);
  });

  it('marks substitution when reason and prescribed product provided', () => {
    expect(
      resolveSubstitutionFields({
        productId: 'prod-b',
        prescribedProductId: 'prod-a',
        substitutionReason: 'Out of stock',
      }),
    ).toEqual({
      isSubstitution: true,
      prescribedProductId: 'prod-a',
      substitutionReason: 'Out of stock',
    });
  });
});
