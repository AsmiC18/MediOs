import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AssignHospitalPlanDto } from './dto/assign-hospital-plan.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { ReplacePlanFeaturesDto } from './dto/replace-plan-features.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { FeatureGateService } from './feature-gate.service';
import { ALL_FEATURE_KEYS } from './feature-keys';
import {
  PLAN_ASSIGNED,
  PLAN_CHANGED,
  PLAN_FEATURE_UPDATED,
} from './plan-audit.actions';
import { assignHospitalPlan } from './plan-bootstrap.util';

export type PlanAdminUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly featureGate: FeatureGateService,
  ) {}

  listPlans() {
    return this.prisma.plan.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getPlan(planId: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: {
        features: {
          select: { featureKey: true, enabled: true },
          orderBy: { featureKey: 'asc' },
        },
      },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      isActive: plan.isActive,
      features: plan.features,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  async createPlan(user: PlanAdminUser, dto: CreatePlanDto) {
    try {
      const plan = await this.prisma.plan.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
          isActive: dto.isActive ?? true,
        },
      });

      for (const featureKey of ALL_FEATURE_KEYS) {
        await this.prisma.planFeature.create({
          data: { planId: plan.id, featureKey, enabled: false },
        });
      }

      await this.auditService.log({
        action: PLAN_CHANGED,
        entity: 'Plan',
        entityId: plan.id,
        hospitalId: user.hospitalId,
        branchId: user.branchId ?? undefined,
        userId: user.sub,
        metadata: { planCode: plan.code, operation: 'create' },
      });

      return plan;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throw new ConflictException('Plan code already exists');
      }
      throw error;
    }
  }

  async updatePlan(user: PlanAdminUser, planId: string, dto: UpdatePlanDto) {
    await this.getPlan(planId);
    const plan = await this.prisma.plan.update({
      where: { id: planId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.auditService.log({
      action: PLAN_CHANGED,
      entity: 'Plan',
      entityId: plan.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? undefined,
      userId: user.sub,
      metadata: { planCode: plan.code, operation: 'update' },
    });

    return plan;
  }

  async replacePlanFeatures(
    user: PlanAdminUser,
    planId: string,
    dto: ReplacePlanFeaturesDto,
  ) {
    await this.getPlan(planId);

    for (const item of dto.features) {
      await this.prisma.planFeature.upsert({
        where: {
          planId_featureKey: { planId, featureKey: item.featureKey },
        },
        update: { enabled: item.enabled },
        create: {
          planId,
          featureKey: item.featureKey,
          enabled: item.enabled,
        },
      });
    }

    await this.auditService.log({
      action: PLAN_FEATURE_UPDATED,
      entity: 'Plan',
      entityId: planId,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        featureCount: dto.features.length,
        enabledCount: dto.features.filter((f) => f.enabled).length,
      },
    });

    return this.getPlan(planId);
  }

  async getHospitalPlan(user: PlanAdminUser, hospitalId: string) {
    this.assertHospitalScope(user, hospitalId);
    const resolved = await this.featureGate.resolvePlan(hospitalId);
    if (!resolved) {
      throw new NotFoundException('No active plan assigned');
    }
    return {
      hospitalId,
      planId: resolved.planId,
      planCode: resolved.planCode,
      planName: resolved.planName,
      startsAt: resolved.startsAt.toISOString(),
      endsAt: resolved.endsAt?.toISOString() ?? null,
      enabledFeatures: [...resolved.enabledFeatures],
    };
  }

  async assignHospitalPlan(
    user: PlanAdminUser,
    hospitalId: string,
    dto: AssignHospitalPlanDto,
  ) {
    this.assertHospitalScope(user, hospitalId);

    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan not found');
    }

    const previous = await this.prisma.hospitalPlan.findFirst({
      where: { hospitalId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    await assignHospitalPlan(this.prisma, hospitalId, dto.planId);

    await this.auditService.log({
      action: previous ? PLAN_CHANGED : PLAN_ASSIGNED,
      entity: 'HospitalPlan',
      entityId: hospitalId,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        targetHospitalId: hospitalId,
        planId: dto.planId,
        planCode: plan.code,
        previousPlanId: previous?.planId ?? null,
      },
    });

    return this.getHospitalPlan(user, hospitalId);
  }

  private assertHospitalScope(user: PlanAdminUser, hospitalId: string): void {
    if (hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Hospital scope denied');
    }
  }
}
