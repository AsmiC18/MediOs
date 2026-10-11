import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureGateService } from './feature-gate.service';
import { FeatureKey } from './feature-keys';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureGate: FeatureGateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<FeatureKey | undefined>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!featureKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { hospitalId?: string } }>();
    const hospitalId = request.user?.hospitalId;

    if (!hospitalId) {
      throw new UnauthorizedException();
    }

    await this.featureGate.assertEnabled(hospitalId, featureKey);
    return true;
  }
}
