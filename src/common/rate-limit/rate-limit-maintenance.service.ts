import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RateLimitStoreService } from './rate-limit-store.service';

@Injectable()
export class RateLimitMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly rateLimitStore: RateLimitStoreService) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.RATE_LIMIT_PURGE_INTERVAL_MS ?? 300_000);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }

    this.timer = setInterval(() => {
      void this.rateLimitStore.purgeExpired().catch(() => undefined);
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
