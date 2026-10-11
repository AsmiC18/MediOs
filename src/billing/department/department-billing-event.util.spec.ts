import {
  diagnosticOrderItemBillingSourceKey,
  emergencyVisitBillingSourceKey,
  ipdDischargeBillingSourceKey,
  opdConsultationBillingSourceKey,
  surgeryProcedureBillingSourceKey,
} from './department-billing-event.util';

describe('department billing source keys', () => {
  it('uses stable consultation key shared with staff attendance billing', () => {
    expect(opdConsultationBillingSourceKey('appt-1')).toBe(
      'staff.attendance.consultation:appt-1',
    );
  });

  it('uses department-specific keys for other hooks', () => {
    expect(ipdDischargeBillingSourceKey('adm-1')).toBe('ipd.discharge:adm-1');
    expect(emergencyVisitBillingSourceKey('vis-1')).toBe('emergency.visit:vis-1');
    expect(diagnosticOrderItemBillingSourceKey('item-1')).toBe(
      'diagnostic.order.item:item-1',
    );
    expect(surgeryProcedureBillingSourceKey('sr-1')).toBe('surgery.procedure:sr-1');
  });
});
