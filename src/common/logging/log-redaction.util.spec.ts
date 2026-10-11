import { redactErrorMessage, redactForLog } from './log-redaction.util';

describe('log-redaction.util', () => {
  it('redacts Bearer tokens in strings', () => {
    const input = 'Auth failed Bearer eyJhbGciOiJIUzI1NiJ9.abc.def';
    expect(redactErrorMessage(input)).not.toContain('eyJhbGci');
    expect(redactErrorMessage(input)).toContain('[REDACTED]');
  });

  it('redacts credential keys on objects', () => {
    const result = redactForLog({
      accessToken: 'secret-token',
      refreshToken: 'refresh-value',
      ok: true,
    }) as Record<string, unknown>;
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.refreshToken).toBe('[REDACTED]');
    expect(result.ok).toBe(true);
  });

  it('redacts message body fields', () => {
    const result = redactForLog({
      content: 'Patient has diabetes',
      body: 'full webhook',
    }) as Record<string, unknown>;
    expect(result.content).toBe('[REDACTED]');
    expect(result.body).toBe('[REDACTED]');
  });

  it('truncates long error messages', () => {
    const long = 'x'.repeat(800);
    expect(redactErrorMessage(long).length).toBeLessThanOrEqual(501);
  });
});
