import { classifyDepartmentFromSourceKey } from './department-revenue.util';

describe('classifyDepartmentFromSourceKey', () => {
  it('maps billing source keys to departments', () => {
    expect(classifyDepartmentFromSourceKey('staff.attendance.consultation:appt-1')).toBe('OPD');
    expect(classifyDepartmentFromSourceKey('ipd.discharge:adm-1')).toBe('IPD');
    expect(classifyDepartmentFromSourceKey('emergency.visit:v-1')).toBe('EMERGENCY');
    expect(classifyDepartmentFromSourceKey('diagnostic.order.item:i-1')).toBe('DIAGNOSTICS');
    expect(classifyDepartmentFromSourceKey('surgery.procedure:s-1')).toBe('SURGERY');
    expect(classifyDepartmentFromSourceKey('pharmacy.dispensing.item:d-1')).toBe('PHARMACY');
    expect(classifyDepartmentFromSourceKey(null)).toBe('OTHER');
  });
});
