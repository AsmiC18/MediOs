import { BadRequestException } from '@nestjs/common';
import { PharmacyPurchaseOrderStatus } from '@prisma/client';
import {
  assertPurchaseOrderTransition,
  isPurchaseOrderReceivable,
} from './po-transitions.util';

describe('purchase order transitions', () => {
  it('allows draft to submitted', () => {
    expect(() =>
      assertPurchaseOrderTransition(
        PharmacyPurchaseOrderStatus.DRAFT,
        PharmacyPurchaseOrderStatus.SUBMITTED,
      ),
    ).not.toThrow();
  });

  it('rejects receive from draft', () => {
    expect(() =>
      assertPurchaseOrderTransition(
        PharmacyPurchaseOrderStatus.DRAFT,
        PharmacyPurchaseOrderStatus.RECEIVED,
      ),
    ).toThrow(BadRequestException);
  });

  it('marks approved and partially received as receivable', () => {
    expect(isPurchaseOrderReceivable(PharmacyPurchaseOrderStatus.APPROVED)).toBe(
      true,
    );
    expect(
      isPurchaseOrderReceivable(PharmacyPurchaseOrderStatus.PARTIALLY_RECEIVED),
    ).toBe(true);
    expect(isPurchaseOrderReceivable(PharmacyPurchaseOrderStatus.DRAFT)).toBe(
      false,
    );
  });
});
