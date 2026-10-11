import { sanitizeAuditMetadata } from './audit-metadata.util';

describe('sanitizeAuditMetadata', () => {
  it('preserves safe operational metadata', () => {
    expect(
      sanitizeAuditMetadata({
        field: 'phone',
        patientId: 'p-1',
        previousEnabled: false,
        enabled: true,
        count: 3,
      }),
    ).toEqual({
      field: 'phone',
      patientId: 'p-1',
      previousEnabled: false,
      enabled: true,
      count: 3,
    });
  });

  it('redacts sensitive keys', () => {
    const result = sanitizeAuditMetadata({
      accessToken: 'tok',
      password: 'pw',
      content: 'clinical note',
      allergies: ['peanut'],
    }) as Record<string, unknown>;
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.content).toBe('[REDACTED]');
    expect(result.allergies).toBe('[REDACTED]');
  });

  it('redacts Bearer tokens in string values', () => {
    const result = sanitizeAuditMetadata({
      note: 'failed with Bearer abc.def.ghi',
    }) as Record<string, unknown>;
    expect(result.note).toBe('[REDACTED]');
  });
});
