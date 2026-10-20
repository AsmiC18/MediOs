/**
 * Demo admin password for Prisma seed (development only).
 * Never log or persist the returned value outside bcrypt hashing.
 */
export function requireSeedAdminPassword(env?: {
  SEED_ADMIN_PASSWORD?: string;
}): string {
  const source = env ?? process.env;
  const password = source.SEED_ADMIN_PASSWORD?.trim();
  if (!password) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set to a non-empty value before running the database seed (demo admin user).',
    );
  }
  return password;
}
