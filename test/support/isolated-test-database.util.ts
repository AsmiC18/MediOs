import { PrismaClient } from '@prisma/client';
import {
  databaseNameFromUrl,
  replaceDatabaseName,
} from './database-url.util';

export const ISOLATED_E2E_DATABASE_NAME = 'medios_test';

export function isIsolatedE2eDatabaseName(name: string): boolean {
  return name === ISOLATED_E2E_DATABASE_NAME;
}

export function resolveConfiguredDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  throw new Error('DATABASE_URL is required for HTTP integration tests');
}

export function resolveIsolatedE2eDatabaseUrl(configuredUrl: string): string {
  return replaceDatabaseName(configuredUrl, ISOLATED_E2E_DATABASE_NAME);
}

export type IsolatedDatabaseEvidence = {
  isolated: boolean;
  configuredDatabaseName: string | null;
  activeDatabaseName: string | null;
  databaseUrl: string;
  reason: string;
};

export async function collectIsolatedDatabaseEvidence(
  databaseUrl: string,
): Promise<IsolatedDatabaseEvidence> {
  const configuredDatabaseName = databaseNameFromUrl(databaseUrl);
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await prisma.$connect();
    const rows = await prisma.$queryRaw<{ current_database: string }[]>`
      SELECT current_database()
    `;
    const activeDatabaseName = rows[0]?.current_database ?? null;

    if (
      configuredDatabaseName &&
      activeDatabaseName &&
      configuredDatabaseName !== activeDatabaseName
    ) {
      return {
        isolated: false,
        configuredDatabaseName,
        activeDatabaseName,
        databaseUrl,
        reason:
          'DATABASE_URL database name does not match the active PostgreSQL connection',
      };
    }

    const name = activeDatabaseName ?? configuredDatabaseName;
    if (!name) {
      return {
        isolated: false,
        configuredDatabaseName,
        activeDatabaseName,
        databaseUrl,
        reason: 'Could not determine the active database name',
      };
    }

    if (!isIsolatedE2eDatabaseName(name)) {
      return {
        isolated: false,
        configuredDatabaseName,
        activeDatabaseName,
        databaseUrl,
        reason: `Refusing to write to non-isolated database "${name}" (expected "${ISOLATED_E2E_DATABASE_NAME}")`,
      };
    }

    return {
      isolated: true,
      configuredDatabaseName,
      activeDatabaseName: name,
      databaseUrl,
      reason: `Active connection verified against isolated database "${name}"`,
    };
  } finally {
    await prisma.$disconnect();
  }
}
