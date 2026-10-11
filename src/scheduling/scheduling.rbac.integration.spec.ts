import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';

class SchedulingPermissionProbes {
  @RequirePermissions('scheduling:read')
  schedulingRead() {}

  @RequirePermissions('scheduling:manage')
  schedulingManage() {}

  @RequirePermissions('roster:read')
  rosterRead() {}

  @RequirePermissions('roster:manage')
  rosterManage() {}

  @RequirePermissions('booking-rules:read')
  bookingRulesRead() {}

  @RequirePermissions('booking-rules:manage')
  bookingRulesManage() {}

  @RequirePermissions('work-schedules:read')
  workSchedulesRead() {}

  @RequirePermissions('work-schedules:manage')
  workSchedulesManage() {}

  @RequirePermissions('leave:read')
  leaveRead() {}

  @RequirePermissions('leave:manage')
  leaveManage() {}
}

describe('Scheduling RBAC integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let readRoleId: string;
  let manageRoleId: string;
  let noPermRoleId: string;

  const reflector = new Reflector();
  let permissionsGuard: PermissionsGuard;
  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    permissionsGuard = new PermissionsGuard(reflector, prisma as never);

    const permissionNames = [
      'scheduling:read',
      'scheduling:manage',
      'roster:read',
      'roster:manage',
      'booking-rules:read',
      'booking-rules:manage',
      'work-schedules:read',
      'work-schedules:manage',
      'leave:read',
      'leave:manage',
    ];
    for (const name of permissionNames) {
      await prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name, description: name },
      });
    }

    hospitalId = (
      await prisma.hospital.create({
        data: { name: `Sched RBAC ${runId}`, code: `SRBAC-${runId}` },
      })
    ).id;

    readRoleId = (
      await prisma.role.create({
        data: { hospitalId, name: `READ-${runId}`, description: 'read' },
      })
    ).id;
    manageRoleId = (
      await prisma.role.create({
        data: { hospitalId, name: `MANAGE-${runId}`, description: 'manage' },
      })
    ).id;
    noPermRoleId = (
      await prisma.role.create({
        data: { hospitalId, name: `NONE-${runId}`, description: 'none' },
      })
    ).id;

    async function grant(roleId: string, permissionName: string) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { name: permissionName },
      });
      await prisma.rolePermission.create({
        data: { roleId, permissionId: permission.id },
      });
    }

    await grant(readRoleId, 'scheduling:read');
    await grant(readRoleId, 'roster:read');
    await grant(readRoleId, 'booking-rules:read');
    await grant(readRoleId, 'work-schedules:read');
    await grant(readRoleId, 'leave:read');

    await grant(manageRoleId, 'scheduling:read');
    await grant(manageRoleId, 'scheduling:manage');
    await grant(manageRoleId, 'roster:read');
    await grant(manageRoleId, 'roster:manage');
    await grant(manageRoleId, 'booking-rules:read');
    await grant(manageRoleId, 'booking-rules:manage');
    await grant(manageRoleId, 'work-schedules:read');
    await grant(manageRoleId, 'work-schedules:manage');
    await grant(manageRoleId, 'leave:read');
    await grant(manageRoleId, 'leave:manage');
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: [readRoleId, manageRoleId, noPermRoleId] } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: [readRoleId, manageRoleId, noPermRoleId] } },
    });
    await prisma.hospital.delete({ where: { id: hospitalId } });
    await prisma.$disconnect();
  });

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  function handlerContext(
    handler: (...args: unknown[]) => unknown,
    roleId: string,
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => SchedulingPermissionProbes,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'user-1', hospitalId, roleId },
        }),
      }),
    } as ExecutionContext;
  }

  async function expectPermissionOnHandler(
    handler: (...args: unknown[]) => unknown,
    requiredPermission: string,
    roleId: string,
    shouldAllow: boolean,
  ) {
    const ctx = handlerContext(handler, roleId);
    const required = reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    expect(required).toEqual([requiredPermission]);

    if (shouldAllow) {
      await expect(permissionsGuard.canActivate(ctx)).resolves.toBe(true);
    } else {
      await expect(permissionsGuard.canActivate(ctx)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
  }

  itDb('staff with scheduling read can read scheduling data', async () => {
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.schedulingRead,
      'scheduling:read',
      readRoleId,
      true,
    );
  });

  itDb('staff without scheduling read gets 403', async () => {
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.schedulingRead,
      'scheduling:read',
      noPermRoleId,
      false,
    );
  });

  itDb('staff with scheduling manage can create/update scheduling data', async () => {
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.schedulingManage,
      'scheduling:manage',
      manageRoleId,
      true,
    );
  });

  itDb('staff without scheduling manage gets 403', async () => {
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.schedulingManage,
      'scheduling:manage',
      readRoleId,
      false,
    );
  });

  itDb('roster permissions are enforced', async () => {
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.rosterRead,
      'roster:read',
      readRoleId,
      true,
    );
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.rosterManage,
      'roster:manage',
      manageRoleId,
      true,
    );
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.rosterManage,
      'roster:manage',
      readRoleId,
      false,
    );
  });

  itDb('booking-rule permissions are enforced', async () => {
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.bookingRulesRead,
      'booking-rules:read',
      readRoleId,
      true,
    );
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.bookingRulesManage,
      'booking-rules:manage',
      manageRoleId,
      true,
    );
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.bookingRulesManage,
      'booking-rules:manage',
      readRoleId,
      false,
    );
  });

  itDb('leave permissions are enforced', async () => {
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.leaveRead,
      'leave:read',
      readRoleId,
      true,
    );
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.leaveManage,
      'leave:manage',
      manageRoleId,
      true,
    );
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.leaveManage,
      'leave:manage',
      readRoleId,
      false,
    );
  });

  itDb('work-schedule permissions are enforced', async () => {
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.workSchedulesRead,
      'work-schedules:read',
      readRoleId,
      true,
    );
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.workSchedulesManage,
      'work-schedules:manage',
      manageRoleId,
      true,
    );
    await expectPermissionOnHandler(
      SchedulingPermissionProbes.prototype.workSchedulesManage,
      'work-schedules:manage',
      readRoleId,
      false,
    );
  });

  it('resource endpoints use scheduling read/manage permission names', () => {
    expect(
      reflector.getAllAndOverride(PERMISSIONS_KEY, [
        SchedulingPermissionProbes.prototype.schedulingRead,
        SchedulingPermissionProbes,
      ]),
    ).toEqual(['scheduling:read']);
    expect(
      reflector.getAllAndOverride(PERMISSIONS_KEY, [
        SchedulingPermissionProbes.prototype.schedulingManage,
        SchedulingPermissionProbes,
      ]),
    ).toEqual(['scheduling:manage']);
  });
});
