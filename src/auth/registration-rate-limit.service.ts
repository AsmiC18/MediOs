import { Injectable } from '@nestjs/common';
import { parseBooleanEnv } from '../common/config/app-environment';
import { RATE_LIMIT_SCOPE_REGISTRATION } from '../common/rate-limit/rate-limit.scopes';
import { RateLimitStoreService } from '../common/rate-limit/rate-limit-store.service';

const BLOCKED_MESSAGE =
  'Too many registration attempts. Please try again later.';

@Injectable()
export class RegistrationRateLimitService {
  constructor(private readonly rateLimitStore: RateLimitStoreService) {}

  isEnabled(): boolean {
    return parseBooleanEnv(process.env.REGISTRATION_RATE_LIMIT_ENABLED, true);
  }

  private getMaxAttempts(): number {
    const configured = Number(
      process.env.REGISTRATION_RATE_LIMIT_MAX_ATTEMPTS ?? 10,
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 10;
  }

  private getWindowMs(): number {
    const configured = Number(
      process.env.REGISTRATION_RATE_LIMIT_WINDOW_MS ?? 900_000,
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 900_000;
  }

  private bucketKey(ip: string, hospitalId: string): string {
    return `${ip}:${hospitalId.trim()}`;
  }

  async recordAttempt(ip: string, hospitalId: string | undefined): Promise<void> {
    if (!this.isEnabled() || !hospitalId?.trim()) {
      return;
    }

    await this.rateLimitStore.incrementAndEnforce(
      RATE_LIMIT_SCOPE_REGISTRATION,
      this.bucketKey(ip, hospitalId),
      this.getMaxAttempts(),
      this.getWindowMs(),
      BLOCKED_MESSAGE,
    );
  }
}
