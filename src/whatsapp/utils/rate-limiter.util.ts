type RateLimitWindow = {
  count: number;
  windowStartMs: number;
};

const windows = new Map<string, RateLimitWindow>();

export function checkOutboundRateLimit(
  hospitalId: string,
  limitPerMinute: number,
): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const existing = windows.get(hospitalId);

  if (!existing || now - existing.windowStartMs >= windowMs) {
    windows.set(hospitalId, { count: 1, windowStartMs: now });
    return true;
  }

  if (existing.count >= limitPerMinute) {
    return false;
  }

  existing.count += 1;
  windows.set(hospitalId, existing);
  return true;
}

export function resetRateLimiterForTests(): void {
  windows.clear();
}
