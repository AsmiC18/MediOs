import { SetMetadata } from '@nestjs/common';
import { WebhookRateLimitProvider } from './rate-limit.scopes';

export const WEBHOOK_RATE_LIMIT_PROVIDER_KEY = 'webhookRateLimitProvider';

export const WebhookRateLimit = (provider: WebhookRateLimitProvider) =>
  SetMetadata(WEBHOOK_RATE_LIMIT_PROVIDER_KEY, provider);
