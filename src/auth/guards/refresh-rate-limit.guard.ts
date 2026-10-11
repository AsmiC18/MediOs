import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { resolveClientIp } from '../client-ip.util';
import { hashRefreshToken } from '../refresh-token.util';
import { RefreshRateLimitService } from '../refresh-rate-limit.service';

@Injectable()
export class RefreshRateLimitGuard implements CanActivate {
  constructor(
    private readonly refreshRateLimitService: RefreshRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      body?: { refreshToken?: string };
    }>();

    const refreshToken = request.body?.refreshToken?.trim();
    if (!refreshToken) {
      return true;
    }

    const ip = resolveClientIp(request);
    const hash = hashRefreshToken(refreshToken);
    await this.refreshRateLimitService.recordAttempt(ip, hash);
    return true;
  }
}
