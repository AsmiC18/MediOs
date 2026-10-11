import { Injectable } from '@nestjs/common';
import { parseBooleanEnv } from '../common/config/app-environment';
import { RATE_LIMIT_SCOPE_LOGIN } from '../common/rate-limit/rate-limit.scopes';
import { RateLimitStoreService } from '../common/rate-limit/rate-limit-store.service';

const BLOCKED_MESSAGE =
  'Too many login attempts. Please try again later.';

@Injectable()
export class LoginRateLimitService {
  constructor(private readonly rateLimitStore: RateLimitStoreService) {}

  isEnabled(): boolean {
    return parseBooleanEnv(process.env.LOGIN_RATE_LIMIT_ENABLED, true);
  }

  private getMaxAttempts(): number {
    const configured = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS ?? 20);
    return Number.isFinite(configured) && configured > 0 ? configured : 20;
  }

  private getWindowMs(): number {
    const configured = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 900_000);
    return Number.isFinite(configured) && configured > 0 ? configured : 900_000;
  }

  private bucketKey(ip: string, email: string): string {
    return `${ip}:${email.trim().toLowerCase()}`;
  }

  async assertAllowed(ip: string, email: string | undefined): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }

    await this.rateLimitStore.assertNotBlocked(
      RATE_LIMIT_SCOPE_LOGIN,
      this.bucketKey(ip, normalizedEmail),
      this.getMaxAttempts(),
      BLOCKED_MESSAGE,
    );
  }

  async recordFailedAttempt(ip: string, email: string | undefined): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }

    await this.rateLimitStore.increment(
      RATE_LIMIT_SCOPE_LOGIN,
      this.bucketKey(ip, normalizedEmail),
      this.getWindowMs(),
    );
  }

  async clearAttempts(ip: string, email: string | undefined): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }

    await this.rateLimitStore.clear(
      RATE_LIMIT_SCOPE_LOGIN,
      this.bucketKey(ip, normalizedEmail),
    );
  }

  resetForTests(): void {
    // Tests use RateLimitStoreService.deleteScope via integration helpers.
  }
}
