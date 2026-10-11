import { Injectable } from '@nestjs/common';
import { parseBooleanEnv } from '../config/app-environment';
import { RateLimitStoreService } from './rate-limit-store.service';
import {
  RATE_LIMIT_SCOPE_WEBHOOK,
  WebhookRateLimitProvider,
} from './rate-limit.scopes';

const BLOCKED_MESSAGE =
  'Too many webhook requests. Please try again later.';

@Injectable()
export class WebhookRateLimitService {
  constructor(private readonly rateLimitStore: RateLimitStoreService) {}

  isEnabled(): boolean {
    return parseBooleanEnv(process.env.WEBHOOK_RATE_LIMIT_ENABLED, true);
  }

  private getMaxAttempts(): number {
    const configured = Number(process.env.WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS ?? 120);
    return Number.isFinite(configured) && configured > 0 ? configured : 120;
  }

  private getWindowMs(): number {
    const configured = Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS ?? 60_000);
    return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
  }

  private bucketKey(provider: WebhookRateLimitProvider, ip: string): string {
    return `${provider}:${ip}`;
  }

  async recordIngress(
    provider: WebhookRateLimitProvider,
    ip: string,
  ): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.rateLimitStore.incrementAndEnforce(
      RATE_LIMIT_SCOPE_WEBHOOK,
      this.bucketKey(provider, ip),
      this.getMaxAttempts(),
      this.getWindowMs(),
      BLOCKED_MESSAGE,
    );
  }
}
