import {
  classifyRazorpayHttpStatus,
  classifyRazorpayReadHttpStatus,
  mapProviderError,
  mapReadProviderError,
  RazorpayError,
  RazorpayReadError,
} from './razorpay.errors';

describe('Razorpay error classification', () => {
  it('treats 4xx as permanent for mutating calls', () => {
    expect(classifyRazorpayHttpStatus(400)).toBe('permanent');
    expect(classifyRazorpayHttpStatus(401)).toBe('permanent');
  });

  it('treats 429 and 5xx as ambiguous for mutating calls', () => {
    expect(classifyRazorpayHttpStatus(429)).toBe('ambiguous');
    expect(classifyRazorpayHttpStatus(503)).toBe('ambiguous');
  });

  it('classifies read HTTP statuses', () => {
    expect(classifyRazorpayReadHttpStatus(404)).toBe('not_found');
    expect(classifyRazorpayReadHttpStatus(401)).toBe('permanent');
    expect(classifyRazorpayReadHttpStatus(403)).toBe('permanent');
    expect(classifyRazorpayReadHttpStatus(400)).toBe('permanent');
    expect(classifyRazorpayReadHttpStatus(429)).toBe('retryable');
    expect(classifyRazorpayReadHttpStatus(500)).toBe('retryable');
    expect(classifyRazorpayReadHttpStatus(502)).toBe('retryable');
    expect(classifyRazorpayReadHttpStatus(503)).toBe('retryable');
  });

  it('classifies timeout errors as ambiguous for mutating calls', () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    const mapped = mapProviderError(timeout);
    expect(mapped.kind).toBe('ambiguous');
  });

  it('classifies timeout errors as retryable for read calls', () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    const mapped = mapReadProviderError(timeout);
    expect(mapped).toBeInstanceOf(RazorpayReadError);
    expect(mapped.kind).toBe('retryable');
    expect(mapped.kind).not.toBe('ambiguous');
  });

  it('classifies generic network errors as ambiguous for mutating calls', () => {
    const mapped = mapProviderError(new Error('ECONNRESET'));
    expect(mapped.kind).toBe('ambiguous');
  });

  it('classifies generic network errors as retryable for read calls', () => {
    const mapped = mapReadProviderError(new Error('ECONNRESET'));
    expect(mapped.kind).toBe('retryable');
  });

  it('maps Razorpay SDK-style HTTP objects for read calls', () => {
    const mapped = mapReadProviderError({ statusCode: 404, error: {} });
    expect(mapped.kind).toBe('not_found');
    expect(mapped.httpStatus).toBe(404);
  });

  it('preserves RazorpayError instances for mutating mapper', () => {
    const original = new RazorpayError('permanent', 'bad request');
    expect(mapProviderError(original)).toBe(original);
  });

  it('read mapper never returns ambiguous kind', () => {
    const cases = [
      mapReadProviderError({ statusCode: 503 }),
      mapReadProviderError(new Error('network')),
      mapReadProviderError({ statusCode: 401 }),
    ];
    for (const err of cases) {
      expect(err).toBeInstanceOf(RazorpayReadError);
      expect(err.kind).not.toBe('ambiguous');
    }
  });
});
