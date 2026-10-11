import { Injectable } from '@nestjs/common';
import { parseBooleanEnv } from '../../common/config/app-environment';
import { RATE_LIMIT_SCOPE_PORTAL_LOGIN } from '../../common/rate-limit/rate-limit.scopes';
import { RateLimitStoreService } from '../../common/rate-limit/rate-limit-store.service';
import { PORTAL_INVALID_CREDENTIALS_MESSAGE } from '../portal-auth.constants';

@Injectable()
export class PortalLoginRateLimitService {
  constructor(private readonly rateLimitStore: RateLimitStoreService) {}

  isEnabled(): boolean {
    return parseBooleanEnv(process.env.PORTAL_LOGIN_RATE_LIMIT_ENABLED, true);
  }

  private getMaxAttempts(): number {
    const configured = Number(process.env.PORTAL_LOGIN_RATE_LIMIT_MAX_ATTEMPTS ?? 20);
    return Number.isFinite(configured) && configured > 0 ? configured : 20;
  }

  private getWindowMs(): number {
    const configured = Number(process.env.PORTAL_LOGIN_RATE_LIMIT_WINDOW_MS ?? 900_000);
    return Number.isFinite(configured) && configured > 0 ? configured : 900_000;
  }

  bucketKey(hospitalId: string, phone: string): string {
    return `${hospitalId}:${phone.trim()}`;
  }

  async assertAllowed(hospitalId: string, phone: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.rateLimitStore.assertNotBlocked(
      RATE_LIMIT_SCOPE_PORTAL_LOGIN,
      this.bucketKey(hospitalId, phone),
      this.getMaxAttempts(),
      PORTAL_INVALID_CREDENTIALS_MESSAGE,
    );
  }

  async recordFailedAttempt(hospitalId: string, phone: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.rateLimitStore.increment(
      RATE_LIMIT_SCOPE_PORTAL_LOGIN,
      this.bucketKey(hospitalId, phone),
      this.getWindowMs(),
    );
  }

  async clearAttempts(hospitalId: string, phone: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.rateLimitStore.clear(
      RATE_LIMIT_SCOPE_PORTAL_LOGIN,
      this.bucketKey(hospitalId, phone),
    );
  }
}
