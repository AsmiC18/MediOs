import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { resolveClientIp } from '../../auth/client-ip.util';
import { WEBHOOK_RATE_LIMIT_PROVIDER_KEY } from './webhook-rate-limit.decorator';
import { WebhookRateLimitService } from './webhook-rate-limit.service';
import { WebhookRateLimitProvider } from './rate-limit.scopes';

@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly webhookRateLimitService: WebhookRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const provider = this.reflector.getAllAndOverride<WebhookRateLimitProvider>(
      WEBHOOK_RATE_LIMIT_PROVIDER_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!provider) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();

    await this.webhookRateLimitService.recordIngress(
      provider,
      resolveClientIp(request),
    );
    return true;
  }
}
