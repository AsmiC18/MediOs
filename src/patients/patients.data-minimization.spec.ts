import { PATIENT_LIST_SELECT } from './patient-list.types';

describe('Patient list data minimization', () => {
  it('list select excludes clinical and ABHA fields', () => {
    const keys = Object.keys(PATIENT_LIST_SELECT);
    expect(keys).not.toContain('abhaId');
    expect(keys).not.toContain('allergies');
    expect(keys).not.toContain('chronicConditions');
    expect(keys).not.toContain('emergencyContacts');
    expect(keys).toContain('id');
    expect(keys).toContain('phone');
    expect(keys).toContain('firstName');
    expect(keys).toContain('suggestedAction');
    expect(keys).toContain('atRiskEvaluatedAt');
    expect(keys).not.toContain('allergies');
  });
});
