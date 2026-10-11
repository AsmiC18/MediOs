export const FeatureKey = {
  PATIENT_ENGAGEMENT: 'PATIENT_ENGAGEMENT',
  REPORTING: 'REPORTING',
  PATIENT_PORTAL: 'PATIENT_PORTAL',
  PHARMACY: 'PHARMACY',
  DIAGNOSTICS: 'DIAGNOSTICS',
  SURGERY: 'SURGERY',
  IPD: 'IPD',
  EMERGENCY: 'EMERGENCY',
  OPD: 'OPD',
  INSURANCE: 'INSURANCE',
  ABDM: 'ABDM',
  CLINICAL: 'CLINICAL',
  ATTENDANCE: 'ATTENDANCE',
  BILLING: 'BILLING',
  SCHEDULING: 'SCHEDULING',
} as const;

export type FeatureKey = (typeof FeatureKey)[keyof typeof FeatureKey];

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FeatureKey);
