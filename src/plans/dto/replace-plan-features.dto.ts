import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { ALL_FEATURE_KEYS, FeatureKey } from '../feature-keys';

export class PlanFeatureItemDto {
  @IsIn(ALL_FEATURE_KEYS)
  featureKey!: FeatureKey;

  @IsBoolean()
  enabled!: boolean;
}

export class ReplacePlanFeaturesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureItemDto)
  features!: PlanFeatureItemDto[];
}
