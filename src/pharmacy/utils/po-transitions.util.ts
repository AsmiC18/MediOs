import { BadRequestException } from '@nestjs/common';
import { PharmacyPurchaseOrderStatus } from '@prisma/client';

const ALLOWED: Partial<
  Record<PharmacyPurchaseOrderStatus, PharmacyPurchaseOrderStatus[]>
> = {
  [PharmacyPurchaseOrderStatus.DRAFT]: [
    PharmacyPurchaseOrderStatus.SUBMITTED,
    PharmacyPurchaseOrderStatus.CANCELLED,
  ],
  [PharmacyPurchaseOrderStatus.SUBMITTED]: [
    PharmacyPurchaseOrderStatus.APPROVED,
    PharmacyPurchaseOrderStatus.CANCELLED,
  ],
  [PharmacyPurchaseOrderStatus.APPROVED]: [
    PharmacyPurchaseOrderStatus.PARTIALLY_RECEIVED,
    PharmacyPurchaseOrderStatus.RECEIVED,
    PharmacyPurchaseOrderStatus.CANCELLED,
  ],
  [PharmacyPurchaseOrderStatus.PARTIALLY_RECEIVED]: [
    PharmacyPurchaseOrderStatus.PARTIALLY_RECEIVED,
    PharmacyPurchaseOrderStatus.RECEIVED,
  ],
};

export function assertPurchaseOrderTransition(
  current: PharmacyPurchaseOrderStatus,
  next: PharmacyPurchaseOrderStatus,
): void {
  const allowed = ALLOWED[current] ?? [];
  if (!allowed.includes(next)) {
    throw new BadRequestException(
      `Cannot transition purchase order from ${current} to ${next}`,
    );
  }
}

export function isPurchaseOrderReceivable(
  status: PharmacyPurchaseOrderStatus,
): boolean {
  return (
    status === PharmacyPurchaseOrderStatus.APPROVED ||
    status === PharmacyPurchaseOrderStatus.PARTIALLY_RECEIVED
  );
}

export function isPurchaseOrderCancellable(
  status: PharmacyPurchaseOrderStatus,
): boolean {
  return (
    status === PharmacyPurchaseOrderStatus.DRAFT ||
    status === PharmacyPurchaseOrderStatus.SUBMITTED ||
    status === PharmacyPurchaseOrderStatus.APPROVED
  );
}

export function isPurchaseOrderDraftEditable(
  status: PharmacyPurchaseOrderStatus,
): boolean {
  return status === PharmacyPurchaseOrderStatus.DRAFT;
}
