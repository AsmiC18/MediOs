import { requireSeedAdminPassword } from './seed-admin-password.util';

describe('requireSeedAdminPassword', () => {
  it('returns trimmed password when configured', () => {
    expect(
      requireSeedAdminPassword({ SEED_ADMIN_PASSWORD: '  local-dev-secret  ' }),
    ).toBe('local-dev-secret');
  });

  it('throws when SEED_ADMIN_PASSWORD is missing', () => {
    expect(() => requireSeedAdminPassword({})).toThrow(
      'SEED_ADMIN_PASSWORD must be set to a non-empty value',
    );
  });

  it('throws when SEED_ADMIN_PASSWORD is blank or whitespace only', () => {
    expect(() =>
      requireSeedAdminPassword({ SEED_ADMIN_PASSWORD: '   ' }),
    ).toThrow('SEED_ADMIN_PASSWORD must be set to a non-empty value');
  });
});
