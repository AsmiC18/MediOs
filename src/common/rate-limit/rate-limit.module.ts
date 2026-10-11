import { Global, Module } from '@nestjs/common';
import { RateLimitMaintenanceService } from './rate-limit-maintenance.service';
import { RateLimitStoreService } from './rate-limit-store.service';
import { WebhookRateLimitGuard } from './webhook-rate-limit.guard';
import { WebhookRateLimitService } from './webhook-rate-limit.service';

@Global()
@Module({
  providers: [
    RateLimitStoreService,
    RateLimitMaintenanceService,
    WebhookRateLimitService,
    WebhookRateLimitGuard,
  ],
  exports: [
    RateLimitStoreService,
    WebhookRateLimitService,
    WebhookRateLimitGuard,
  ],
})
export class RateLimitModule {}
