import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { resolveClientIp } from '../client-ip.util';
import { RegistrationRateLimitService } from '../registration-rate-limit.service';

@Injectable()
export class RegistrationRateLimitGuard implements CanActivate {
  constructor(
    private readonly registrationRateLimitService: RegistrationRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      body?: { hospitalId?: string };
    }>();

    const ip = resolveClientIp(request);
    const hospitalId = request.body?.hospitalId;
    await this.registrationRateLimitService.recordAttempt(ip, hospitalId);
    return true;
  }
}
