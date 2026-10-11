import { ManualDiagnosticLabAggregatorAdapter } from './adapters/manual-diagnostic-lab-aggregator.adapter';

describe('ManualDiagnosticLabAggregatorAdapter', () => {
  it('returns MANUAL_REQUIRED without faking external submission', async () => {
    const adapter = new ManualDiagnosticLabAggregatorAdapter();
    const result = await adapter.submitOrder({
      hospitalId: 'h1',
      branchId: null,
      orderId: 'o1',
      orderNumber: 'LAB-000001',
      patientId: 'p1',
      itemCount: 1,
    });

    expect(result.outcome).toBe('MANUAL_REQUIRED');
    expect(result).not.toHaveProperty('externalReference');
  });
});
