export const INTERNAL_DELIVERY_STATUSES = [
  'queued',
  'processing',
  'sent',
  'failed',
  'retrying',
  'uncertain',
] as const;

export type InternalDeliveryStatus = (typeof INTERNAL_DELIVERY_STATUSES)[number];

export type NotificationDeliveryStatsResponse = {
  from: string;
  to: string;
  branchId: string | null;
  channel: string | null;
  statusFilter: InternalDeliveryStatus | null;
  totals: Record<InternalDeliveryStatus, number>;
  totalRows: number;
};
