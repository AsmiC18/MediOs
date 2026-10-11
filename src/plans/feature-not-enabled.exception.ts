import { ForbiddenException } from '@nestjs/common';
import { FeatureKey } from './feature-keys';

export const FEATURE_NOT_ENABLED_CODE = 'FEATURE_NOT_ENABLED';

export class FeatureNotEnabledException extends ForbiddenException {
  constructor(featureKey: FeatureKey) {
    super({
      code: FEATURE_NOT_ENABLED_CODE,
      message: 'Feature is not enabled for this hospital',
      featureKey,
    });
  }
}
