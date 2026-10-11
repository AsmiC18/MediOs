import { PrismaClient } from '@prisma/client';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../audit/audit.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { toStaffJwtUser } from '../auth/staff-jwt-payload.util';
import { toPatientPrincipal } from '../portal/portal-auth/portal-jwt-payload.util';
import { PATIENT_PRINCIPAL_TYPE } from '../portal/portal.types';
import { FEATURE_NOT_ENABLED_CODE } from './feature-not-enabled.exception';
import { FeatureGateService } from './feature-gate.service';
import { FeatureGuard } from './feature.guard';
import { FeatureKey } from './feature-keys';
import {
  assignHospitalPlan,
  bootstrapPlanCatalogue,
  PLAN_CODES,
} from './plan-bootstrap.util';
import { PlansService } from './plans.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';

describe('Plan / feature gating integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalA: string;
  let hospitalB: string;
  let adminUserId: string;
  let adminRoleId: string;
  let basicPlanId: string;
  let enterprisePlanId: string;

  let featureGate: FeatureGateService;
  let featureGuard: FeatureGuard;
  let plansService: PlansService;

  const adminUser = () => ({
    sub: adminUserId,
    hospitalId: hospitalA,
    branchId: null as string | null,
    roleId: adminRoleId,
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const audit = new AuditService(prisma as never);
    featureGate = new FeatureGateService(prisma as never);
    featureGuard = new FeatureGuard(new Reflector(), featureGate);
    plansService = new PlansService(prisma as never, audit, featureGate);

    const catalogue = await bootstrapPlanCatalogue(prisma);
    basicPlanId = catalogue.basicId;
    enterprisePlanId = catalogue.enterpriseId;

    hospitalA = (
      await prisma.hospital.create({
        data: { name: `FG A ${runId}`, code: `FGA-${runId}` },
      })
    ).id;

    hospitalB = (
      await prisma.hospital.create({
        data: { name: `FG B ${runId}`, code: `FGB-${runId}` },
      })
    ).id;

    adminRoleId = (
      await prisma.role.create({
        data: { hospitalId: hospitalA, name: `FGADM-${runId}` },
      })
    ).id;

    for (const name of ['plans:read', 'plans:manage']) {
      const permission = await prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name, description: name },
      });
      await prisma.rolePermission.create({
        data: { roleId: adminRoleId, permissionId: permission.id },
      });
    }

    adminUserId = (
      await prisma.user.create({
        data: {
          hospitalId: hospitalA,
          roleId: adminRoleId,
          email: `fg-${runId}@test.com`,
          name: 'FG Admin',
          passwordHash: 'hash',
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  itDb('FeatureGateService allows enabled and denies disabled features', async () => {
    await assignHospitalPlan(prisma, hospitalA, basicPlanId);

    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    expect(await featureGate.isEnabled(hospitalA, FeatureKey.SCHEDULING)).toBe(true);
    expect(await featureGate.isEnabled(hospitalA, FeatureKey.PHARMACY)).toBe(false);

    await expect(
      featureGate.assertEnabled(hospitalA, FeatureKey.PHARMACY),
    ).rejects.toMatchObject({
      response: { code: FEATURE_NOT_ENABLED_CODE },
    });

    process.env.NODE_ENV = prevEnv;
  });

  itDb('denies when no plan in production mode', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    expect(await featureGate.resolvePlan(hospitalB)).toBeNull();
    expect(await featureGate.isEnabled(hospitalB, FeatureKey.BILLING)).toBe(false);

    process.env.NODE_ENV = prevEnv;
  });

  itDb('denies expired and inactive hospital plans', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await assignHospitalPlan(prisma, hospitalB, enterprisePlanId);
    await prisma.hospitalPlan.updateMany({
      where: { hospitalId: hospitalB, isActive: true },
      data: {
        isActive: false,
        endsAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    });

    expect(await featureGate.isEnabled(hospitalB, FeatureKey.REPORTING)).toBe(false);

    process.env.NODE_ENV = prevEnv;
  });

  itDb('does not leak features across hospitals', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await assignHospitalPlan(prisma, hospitalA, enterprisePlanId);
    await prisma.hospitalPlan.updateMany({
      where: { hospitalId: hospitalB },
      data: { isActive: false },
    });

    expect(await featureGate.isEnabled(hospitalA, FeatureKey.ABDM)).toBe(true);
    expect(await featureGate.isEnabled(hospitalB, FeatureKey.ABDM)).toBe(false);

    process.env.NODE_ENV = prevEnv;
  });

  itDb('FeatureGuard enforces feature and requires hospital context', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await assignHospitalPlan(prisma, hospitalA, basicPlanId);

    const reflector = new Reflector();
    const guard = new FeatureGuard(reflector, featureGate);
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue(FeatureKey.PHARMACY);

    const okCtx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { hospitalId: hospitalA } }),
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(okCtx)).rejects.toBeInstanceOf(ForbiddenException);

    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValue(FeatureKey.SCHEDULING);
    await expect(guard.canActivate(okCtx)).resolves.toBe(true);

    const noUserCtx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: undefined }) }),
    } as ExecutionContext;
    await expect(guard.canActivate(noUserCtx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    process.env.NODE_ENV = prevEnv;
  });

  itDb('admin can assign plan; enforces single active plan', async () => {
    await plansService.assignHospitalPlan(adminUser(), hospitalA, {
      planId: basicPlanId,
    });
    await plansService.assignHospitalPlan(adminUser(), hospitalA, {
      planId: enterprisePlanId,
    });

    const active = await prisma.hospitalPlan.count({
      where: { hospitalId: hospitalA, isActive: true },
    });
    expect(active).toBe(1);

    const resolved = await plansService.getHospitalPlan(adminUser(), hospitalA);
    expect(resolved.planCode).toBe(PLAN_CODES.ENTERPRISE);
  });

  itDb('plan assignment is audited', async () => {
    const before = await prisma.auditLog.count({
      where: { hospitalId: hospitalA, action: 'PLAN_CHANGED' },
    });
    await plansService.assignHospitalPlan(adminUser(), hospitalA, {
      planId: basicPlanId,
    });
    const after = await prisma.auditLog.count({
      where: { hospitalId: hospitalA, action: 'PLAN_CHANGED' },
    });
    expect(after).toBeGreaterThan(before);
  });

  itDb('cross-hospital plan management is rejected', async () => {
    await expect(
      plansService.getHospitalPlan(adminUser(), hospitalB),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  itDb('JWT separation: patient token is not staff user', async () => {
    expect(() =>
      toStaffJwtUser({
        principalType: PATIENT_PRINCIPAL_TYPE,
        sub: 'patient-id',
        hospitalId: hospitalA,
        branchId: null,
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      toPatientPrincipal({
        principalType: 'STAFF',
        sub: adminUserId,
        hospitalId: hospitalA,
        roleId: adminRoleId,
      } as never),
    ).toThrow(UnauthorizedException);
  });

  itDb('PermissionsGuard still required alongside feature metadata', async () => {
    const reflector = new Reflector();
    const permissionsGuard = new PermissionsGuard(reflector, prisma as never);
    reflector.getAllAndOverride = jest.fn().mockReturnValue(['plans:read']);

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: adminUserId, hospitalId: hospitalA, roleId: adminRoleId },
        }),
      }),
    } as ExecutionContext;

    await expect(permissionsGuard.canActivate(ctx)).resolves.toBe(true);

    reflector.getAllAndOverride = jest.fn().mockReturnValue(['plans:manage']);
    const limitedRole = await prisma.role.create({
      data: { hospitalId: hospitalA, name: `FGLIM-${runId}` },
    });
    const perm = await prisma.permission.findUniqueOrThrow({
      where: { name: 'plans:read' },
    });
    await prisma.rolePermission.create({
      data: { roleId: limitedRole.id, permissionId: perm.id },
    });

    const limitedCtx = {
      ...ctx,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            sub: adminUserId,
            hospitalId: hospitalA,
            roleId: limitedRole.id,
          },
        }),
      }),
    } as ExecutionContext;

    await expect(permissionsGuard.canActivate(limitedCtx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
