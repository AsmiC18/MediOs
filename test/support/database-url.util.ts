export function databaseNameFromUrl(databaseUrl: string): string | null {
  const trimmed = databaseUrl.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const normalized = trimmed.replace(/^postgresql:/i, 'postgres:');
    const parsed = new URL(normalized);
    const name = parsed.pathname.replace(/^\//, '').split('/')[0];
    return name || null;
  } catch {
    const match = trimmed.match(/\/([^/?]+)(?:\?|$)/);
    return match?.[1] ?? null;
  }
}

export function replaceDatabaseName(
  databaseUrl: string,
  databaseName: string,
): string {
  const trimmed = databaseUrl.trim();
  const match = trimmed.match(/^([^?]+\/)([^/?]+)(\?.*)?$/);
  if (!match) {
    throw new Error('DATABASE_URL is not a valid PostgreSQL connection string');
  }
  return `${match[1]}${databaseName}${match[3] ?? ''}`;
}
