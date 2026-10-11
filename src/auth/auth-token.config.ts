const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/i;

function parseDurationToMs(value: string): number {
  const trimmed = value.trim();
  const match = DURATION_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid duration format: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit]!;
}

export function resolveJwtAccessTtl(): string {
  const configured = process.env.JWT_ACCESS_TTL?.trim();
  return configured || '15m';
}

export function resolveJwtAccessTtlSeconds(): number {
  const ms = parseDurationToMs(resolveJwtAccessTtl());
  return Math.floor(ms / 1000);
}

export function resolveRefreshTokenTtlMs(): number {
  const configured = process.env.REFRESH_TOKEN_TTL?.trim();
  return parseDurationToMs(configured || '7d');
}

export function resolveRefreshExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + resolveRefreshTokenTtlMs());
}
