import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { resolveClientIp } from '../client-ip.util';
import { LoginRateLimitService } from '../login-rate-limit.service';

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly loginRateLimitService: LoginRateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      body?: { email?: string };
    }>();

    await this.loginRateLimitService.assertAllowed(
      resolveClientIp(request),
      request.body?.email,
    );
    return true;
  }
}
