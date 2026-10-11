export type PaymentLinkPaymentSnapshot = {
  payment_id?: string;
  status?: string;
  amount?: number | string;
};

export type PaymentLinkEntity = {
  id: string;
  short_url?: string;
  reference_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  payments?: PaymentLinkPaymentSnapshot | PaymentLinkPaymentSnapshot[] | null;
};

export type PaymentEntity = {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  order_id?: string;
  captured?: boolean;
};

export type RefundEntity = {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  payment_id?: string;
};
