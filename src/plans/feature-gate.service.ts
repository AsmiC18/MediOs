import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ALL_FEATURE_KEYS, FeatureKey } from './feature-keys';
import { featureKeyToDepartmentKey } from './hospital-department-keys.util';
import { FeatureNotEnabledException } from './feature-not-enabled.exception';

export type ResolvedHospitalPlan = {
  hospitalPlanId: string;
  planId: string;
  planCode: string;
  planName: string;
  startsAt: Date;
  endsAt: Date | null;
  enabledFeatures: Set<FeatureKey>;
};

@Injectable()
export class FeatureGateService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePlan(hospitalId: string): Promise<ResolvedHospitalPlan | null> {
    const now = new Date();
    const assignment = await this.prisma.hospitalPlan.findFirst({
      where: {
        hospitalId,
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        plan: { isActive: true },
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        plan: {
          include: {
            features: true,
          },
        },
      },
    });

    if (!assignment) {
      if (process.env.NODE_ENV === 'test') {
        return this.virtualAllFeaturesPlan(hospitalId);
      }
      return null;
    }

    const enabledFeatures = new Set<FeatureKey>();
    for (const row of assignment.plan.features) {
      if (row.enabled && ALL_FEATURE_KEYS.includes(row.featureKey as FeatureKey)) {
        enabledFeatures.add(row.featureKey as FeatureKey);
      }
    }

    return {
      hospitalPlanId: assignment.id,
      planId: assignment.planId,
      planCode: assignment.plan.code,
      planName: assignment.plan.name,
      startsAt: assignment.startsAt,
      endsAt: assignment.endsAt,
      enabledFeatures,
    };
  }

  async isEnabled(hospitalId: string, featureKey: FeatureKey): Promise<boolean> {
    const plan = await this.resolvePlan(hospitalId);
    if (!plan) {
      return false;
    }
    return plan.enabledFeatures.has(featureKey);
  }

  async assertEnabled(hospitalId: string, featureKey: FeatureKey): Promise<void> {
    const enabled = await this.isEnabled(hospitalId, featureKey);
    if (!enabled) {
      throw new FeatureNotEnabledException(featureKey);
    }

    const departmentKey = featureKeyToDepartmentKey(featureKey);
    if (departmentKey) {
      const toggle = await this.prisma.hospitalDepartmentToggle.findUnique({
        where: {
          hospitalId_departmentKey: { hospitalId, departmentKey },
        },
      });
      if (toggle && !toggle.enabled) {
        throw new FeatureNotEnabledException(featureKey);
      }
    }
  }

  async getEnabledFeatures(hospitalId: string): Promise<FeatureKey[]> {
    const plan = await this.resolvePlan(hospitalId);
    if (!plan) {
      return [];
    }
    return [...plan.enabledFeatures];
  }

  private virtualAllFeaturesPlan(hospitalId: string): ResolvedHospitalPlan {
    return {
      hospitalPlanId: `virtual:${hospitalId}`,
      planId: 'virtual',
      planCode: 'TEST_LEGACY',
      planName: 'Test legacy (all features)',
      startsAt: new Date(0),
      endsAt: null,
      enabledFeatures: new Set(ALL_FEATURE_KEYS),
    };
  }
}
