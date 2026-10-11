import { HospitalDepartmentKey } from '@prisma/client';
import { FeatureKey } from './feature-keys';

const DEPARTMENT_FEATURE_MAP: Partial<Record<FeatureKey, HospitalDepartmentKey>> = {
  [FeatureKey.OPD]: HospitalDepartmentKey.OPD,
  [FeatureKey.IPD]: HospitalDepartmentKey.IPD,
  [FeatureKey.EMERGENCY]: HospitalDepartmentKey.EMERGENCY,
  [FeatureKey.PHARMACY]: HospitalDepartmentKey.PHARMACY,
  [FeatureKey.DIAGNOSTICS]: HospitalDepartmentKey.DIAGNOSTICS,
  [FeatureKey.SURGERY]: HospitalDepartmentKey.SURGERY,
};

export function featureKeyToDepartmentKey(
  featureKey: FeatureKey,
): HospitalDepartmentKey | null {
  return DEPARTMENT_FEATURE_MAP[featureKey] ?? null;
}

export const TOGGLEABLE_DEPARTMENT_KEYS = Object.values(
  HospitalDepartmentKey,
) as HospitalDepartmentKey[];
