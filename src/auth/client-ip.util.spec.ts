import { resolveClientIp } from './client-ip.util';

describe('resolveClientIp', () => {
  const originalTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = originalTrustProxy;
    }
  });

  it('uses request.ip when trust proxy is disabled', () => {
    process.env.TRUST_PROXY = 'false';
    const ip = resolveClientIp({
      ip: '203.0.113.10',
      headers: { 'x-forwarded-for': '198.51.100.99' },
    });
    expect(ip).toBe('203.0.113.10');
  });

  it('ignores spoofed X-Forwarded-For when trust proxy is disabled', () => {
    process.env.TRUST_PROXY = 'false';
    const ip = resolveClientIp({
      ip: '203.0.113.10',
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    });
    expect(ip).toBe('203.0.113.10');
  });

  it('uses first forwarded IP when trust proxy is enabled', () => {
    process.env.TRUST_PROXY = 'true';
    const ip = resolveClientIp({
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.50, 10.0.0.1' },
    });
    expect(ip).toBe('198.51.100.50');
  });

  it('falls back to request.ip when trust proxy enabled but header missing', () => {
    process.env.TRUST_PROXY = 'true';
    const ip = resolveClientIp({ ip: '203.0.113.20' });
    expect(ip).toBe('203.0.113.20');
  });

  it('returns unknown when no ip is available', () => {
    process.env.TRUST_PROXY = 'false';
    expect(resolveClientIp({})).toBe('unknown');
  });
});
