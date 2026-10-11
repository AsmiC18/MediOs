export const PHARMACY_LOW_STOCK_EVENT_TYPE = 'pharmacy.inventory.low_stock';
export const PHARMACY_BATCH_EXPIRED_EVENT_TYPE = 'pharmacy.inventory.batch_expired';
export const PHARMACY_BATCH_EXPIRING_EVENT_TYPE =
  'pharmacy.inventory.batch_expiring';

export function pharmacyLowStockOutboxKey(input: {
  hospitalId: string;
  branchId: string | null;
  productId: string;
  windowKey: string;
}): string {
  return `${PHARMACY_LOW_STOCK_EVENT_TYPE}:${input.hospitalId}:${input.branchId ?? 'hospital'}:${input.productId}:${input.windowKey}`;
}

export function pharmacyBatchExpiryOutboxKey(input: {
  hospitalId: string;
  batchId: string;
  kind: 'expired' | 'expiring';
  windowKey: string;
}): string {
  return `pharmacy.inventory.batch_${input.kind}:${input.hospitalId}:${input.batchId}:${input.windowKey}`;
}
