import { PrismaClient } from '@prisma/client';
import { ALL_FEATURE_KEYS, FeatureKey } from './feature-keys';

export const PLAN_CODES = {
  BASIC: 'BASIC',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE',
  /** Product alias → same feature set as BASIC */
  STARTER: 'STARTER',
  /** Product alias → same feature set as PROFESSIONAL */
  GROWTH: 'GROWTH',
  /** Product alias → same feature set as PROFESSIONAL */
  PRO: 'PRO',
} as const;

const BASIC_FEATURES: FeatureKey[] = [
  FeatureKey.SCHEDULING,
  FeatureKey.BILLING,
  FeatureKey.CLINICAL,
  FeatureKey.ATTENDANCE,
  FeatureKey.OPD,
];

const PROFESSIONAL_FEATURES: FeatureKey[] = [
  ...BASIC_FEATURES,
  FeatureKey.PHARMACY,
  FeatureKey.DIAGNOSTICS,
  FeatureKey.REPORTING,
  FeatureKey.INSURANCE,
  FeatureKey.IPD,
  FeatureKey.EMERGENCY,
  FeatureKey.PATIENT_ENGAGEMENT,
];

const ENTERPRISE_FEATURES: FeatureKey[] = [...ALL_FEATURE_KEYS];

export async function bootstrapPlanCatalogue(
  prisma: PrismaClient,
): Promise<{ basicId: string; professionalId: string; enterpriseId: string }> {
  const basic = await prisma.plan.upsert({
    where: { code: PLAN_CODES.BASIC },
    update: { name: 'Basic', description: 'Core OPD, billing, clinical, scheduling', isActive: true },
    create: {
      code: PLAN_CODES.BASIC,
      name: 'Basic',
      description: 'Core OPD, billing, clinical, scheduling',
      isActive: true,
    },
  });

  const professional = await prisma.plan.upsert({
    where: { code: PLAN_CODES.PROFESSIONAL },
    update: {
      name: 'Professional',
      description: 'Adds pharmacy, diagnostics, reporting, insurance, IPD, emergency',
      isActive: true,
    },
    create: {
      code: PLAN_CODES.PROFESSIONAL,
      name: 'Professional',
      description: 'Adds pharmacy, diagnostics, reporting, insurance, IPD, emergency',
      isActive: true,
    },
  });

  const enterprise = await prisma.plan.upsert({
    where: { code: PLAN_CODES.ENTERPRISE },
    update: {
      name: 'Enterprise',
      description: 'All MediOS modules including portal, surgery, ABDM',
      isActive: true,
    },
    create: {
      code: PLAN_CODES.ENTERPRISE,
      name: 'Enterprise',
      description: 'All MediOS modules including portal, surgery, ABDM',
      isActive: true,
    },
  });

  await syncPlanFeatures(prisma, basic.id, BASIC_FEATURES);
  await syncPlanFeatures(prisma, professional.id, PROFESSIONAL_FEATURES);
  await syncPlanFeatures(prisma, enterprise.id, ENTERPRISE_FEATURES);

  const starter = await prisma.plan.upsert({
    where: { code: PLAN_CODES.STARTER },
    update: { name: 'Starter', isActive: true },
    create: {
      code: PLAN_CODES.STARTER,
      name: 'Starter',
      description: 'Alias of Basic plan catalogue',
      isActive: true,
    },
  });
  const growth = await prisma.plan.upsert({
    where: { code: PLAN_CODES.GROWTH },
    update: { name: 'Growth', isActive: true },
    create: {
      code: PLAN_CODES.GROWTH,
      name: 'Growth',
      description: 'Alias of Professional plan catalogue',
      isActive: true,
    },
  });
  const pro = await prisma.plan.upsert({
    where: { code: PLAN_CODES.PRO },
    update: { name: 'Pro', isActive: true },
    create: {
      code: PLAN_CODES.PRO,
      name: 'Pro',
      description: 'Alias of Professional plan catalogue',
      isActive: true,
    },
  });

  await syncPlanFeatures(prisma, starter.id, BASIC_FEATURES);
  await syncPlanFeatures(prisma, growth.id, PROFESSIONAL_FEATURES);
  await syncPlanFeatures(prisma, pro.id, PROFESSIONAL_FEATURES);

  return {
    basicId: basic.id,
    professionalId: professional.id,
    enterpriseId: enterprise.id,
  };
}

async function syncPlanFeatures(
  prisma: PrismaClient,
  planId: string,
  enabled: FeatureKey[],
): Promise<void> {
  const enabledSet = new Set(enabled);
  for (const featureKey of ALL_FEATURE_KEYS) {
    await prisma.planFeature.upsert({
      where: {
        planId_featureKey: { planId, featureKey },
      },
      update: { enabled: enabledSet.has(featureKey) },
      create: {
        planId,
        featureKey,
        enabled: enabledSet.has(featureKey),
      },
    });
  }
}

export async function assignHospitalPlan(
  prisma: PrismaClient,
  hospitalId: string,
  planId: string,
  startsAt: Date = new Date(),
): Promise<void> {
  await prisma.hospitalPlan.updateMany({
    where: { hospitalId, isActive: true },
    data: { isActive: false, endsAt: new Date() },
  });

  await prisma.hospitalPlan.create({
    data: {
      hospitalId,
      planId,
      isActive: true,
      startsAt,
      endsAt: null,
    },
  });
}

export async function bootstrapHospitalEnterprisePlan(
  prisma: PrismaClient,
  hospitalId: string,
): Promise<void> {
  const { enterpriseId } = await bootstrapPlanCatalogue(prisma);
  const existing = await prisma.hospitalPlan.findFirst({
    where: { hospitalId, isActive: true },
  });
  if (existing) {
    return;
  }
  await assignHospitalPlan(prisma, hospitalId, enterpriseId);
}
