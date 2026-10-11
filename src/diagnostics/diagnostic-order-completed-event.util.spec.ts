import { NOTIFICATION_CHANNEL_UNROUTED } from '../notifications/notification.constants';
import {
  DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE,
  buildDiagnosticOrderCompletedDomainEvent,
  diagnosticOrderCompletedIdempotencyKey,
} from './diagnostic-order-completed-event.util';

describe('diagnostic order completed domain event', () => {
  it('uses deterministic idempotency key per order', () => {
    expect(diagnosticOrderCompletedIdempotencyKey('order-1')).toBe(
      `${DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE}:order-1`,
    );
  });

  it('builds minimal notification payload without clinical results', () => {
    const envelope = buildDiagnosticOrderCompletedDomainEvent({
      diagnosticOrderId: 'order-1',
      orderNumber: 'LAB-000001',
      patientId: 'patient-1',
      hospitalId: 'hospital-1',
      branchId: 'branch-1',
      completedByUserId: 'user-1',
      itemCount: 2,
    });

    const payload = envelope.payload as Record<string, unknown>;
    expect(payload.channel).toBe(NOTIFICATION_CHANNEL_UNROUTED);
    expect(payload.diagnosticOrderId).toBe('order-1');
    expect(payload.patientId).toBe('patient-1');
    expect(payload.resultValue).toBeUndefined();
    expect(JSON.stringify(payload)).not.toMatch(/resultValue|resultNotes/i);
  });
});
