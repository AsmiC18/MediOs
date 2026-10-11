import { Injectable } from '@nestjs/common';
import { parseBooleanEnv } from '../common/config/app-environment';
import { RATE_LIMIT_SCOPE_REFRESH } from '../common/rate-limit/rate-limit.scopes';
import { RateLimitStoreService } from '../common/rate-limit/rate-limit-store.service';

const BLOCKED_MESSAGE =
  'Too many refresh attempts. Please try again later.';

@Injectable()
export class RefreshRateLimitService {
  constructor(private readonly rateLimitStore: RateLimitStoreService) {}

  isEnabled(): boolean {
    return parseBooleanEnv(process.env.REFRESH_RATE_LIMIT_ENABLED, true);
  }

  private getMaxAttempts(): number {
    const configured = Number(process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS ?? 30);
    return Number.isFinite(configured) && configured > 0 ? configured : 30;
  }

  private getWindowMs(): number {
    const configured = Number(process.env.REFRESH_RATE_LIMIT_WINDOW_MS ?? 900_000);
    return Number.isFinite(configured) && configured > 0 ? configured : 900_000;
  }

  private bucketKey(ip: string, refreshTokenHash: string): string {
    const hashPrefix = refreshTokenHash.slice(0, 16);
    return `${ip}:${hashPrefix}`;
  }

  async recordAttempt(ip: string, refreshTokenHash: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.rateLimitStore.incrementAndEnforce(
      RATE_LIMIT_SCOPE_REFRESH,
      this.bucketKey(ip, refreshTokenHash),
      this.getMaxAttempts(),
      this.getWindowMs(),
      BLOCKED_MESSAGE,
    );
  }

  resetForTests(): void {
    // Integration tests clear scope via store helper.
  }
}
