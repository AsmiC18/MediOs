export type DiagnosticLabAggregatorSubmitInput = {
  hospitalId: string;
  branchId: string | null;
  orderId: string;
  orderNumber: string;
  patientId: string;
  itemCount: number;
};

export type DiagnosticLabAggregatorSubmitResult =
  | { outcome: 'MANUAL_REQUIRED'; message: string }
  | { outcome: 'EXTERNAL_SUBMITTED'; externalReference: string; message?: string };

export type DiagnosticLabAggregatorStatusResult = {
  status: 'MANUAL_REQUIRED' | 'EXTERNAL_SUBMITTED' | 'NONE';
  externalReference?: string | null;
  message?: string;
};

export interface DiagnosticLabAggregatorAdapter {
  submitOrder(
    input: DiagnosticLabAggregatorSubmitInput,
  ): Promise<DiagnosticLabAggregatorSubmitResult>;
}

export const DIAGNOSTIC_LAB_AGGREGATOR_ADAPTER = Symbol(
  'DIAGNOSTIC_LAB_AGGREGATOR_ADAPTER',
);
