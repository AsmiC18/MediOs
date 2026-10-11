import {
  resolveJwtAccessTtlSeconds,
  resolveRefreshTokenTtlMs,
} from './auth-token.config';

describe('auth-token.config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults access TTL to 15 minutes in seconds', () => {
    delete process.env.JWT_ACCESS_TTL;
    expect(resolveJwtAccessTtlSeconds()).toBe(15 * 60);
  });

  it('defaults refresh TTL to 7 days in ms', () => {
    delete process.env.REFRESH_TOKEN_TTL;
    expect(resolveRefreshTokenTtlMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
