import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from './feature-keys';

export const REQUIRE_FEATURE_KEY = 'requireFeature';

export const RequireFeature = (featureKey: FeatureKey) =>
  SetMetadata(REQUIRE_FEATURE_KEY, featureKey);
