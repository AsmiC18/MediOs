import { PrismaClient } from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../audit/audit.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { UsersService } from '../users/users.service';
import {
  ROLE_CREATED,
  ROLE_DELETED,
  ROLE_PERMISSION_GRANTED,
  ROLE_PERMISSION_REVOKED,
  ROLE_UPDATED,
  USER_ROLE_ASSIGNED,
} from './role-audit.actions';
import { bootstrapHospitalRoleCatalogue } from './role-bootstrap.util';
import { DEFAULT_ROLE_TEMPLATES } from './role-templates';
import { RolesService } from './roles.service';

describe('RBAC role management integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalA: string;
  let hospitalB: string;
  let branchA: string;
  let adminUserId: string;
  let adminRoleId: string;
  let limitedRoleId: string;
  let limitedUserId: string;

  let rolesService: RolesService;
  let usersService: UsersService;

  const adminActor = () => ({
    sub: adminUserId,
    hospitalId: hospitalA,
    branchId: null as string | null,
    roleId: adminRoleId,
    role: 'ADMIN',
  });

  const limitedActor = () => ({
    sub: limitedUserId,
    hospitalId: hospitalA,
    branchId: branchA,
    roleId: limitedRoleId,
    role: 'LIMITED',
  });

  async function grant(roleId: string, permissionName: string) {
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { name: permissionName },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId, permissionId: permission.id },
      },
      update: {},
      create: { roleId, permissionId: permission.id },
    });
  }

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const audit = new AuditService(prisma as never);
    rolesService = new RolesService(prisma as never, audit);
    usersService = new UsersService(prisma as never, audit);

    hospitalA = (
      await prisma.hospital.create({
        data: { name: `RBAC A ${runId}`, code: `RBA-${runId}` },
      })
    ).id;

    hospitalB = (
      await prisma.hospital.create({
        data: { name: `RBAC B ${runId}`, code: `RBB-${runId}` },
      })
    ).id;

    branchA = (
      await prisma.branch.create({
        data: { hospitalId: hospitalA, name: 'Main', code: `BR-${runId}` },
      })
    ).id;

    adminRoleId = (
      await prisma.role.create({
        data: {
          hospitalId: hospitalA,
          name: 'ADMIN',
          description: 'Admin',
        },
      })
    ).id;

    const rbacCatalogue = [
      { name: 'roles:read', description: 'View roles and permission catalogue' },
      { name: 'roles:manage', description: 'Create and manage roles and permissions' },
      { name: 'users:read', description: 'View users for role assignment' },
      { name: 'users:manage', description: 'Assign roles to users' },
    ];
    for (const entry of rbacCatalogue) {
      await prisma.permission.upsert({
        where: { name: entry.name },
        update: { description: entry.description },
        create: entry,
      });
    }

    const allPermissions = await prisma.permission.findMany();
    for (const permission of allPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRoleId,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: adminRoleId, permissionId: permission.id },
      });
    }

    limitedRoleId = (
      await prisma.role.create({
        data: {
          hospitalId: hospitalA,
          name: 'LIMITED',
          description: 'Limited',
        },
      })
    ).id;
    await grant(limitedRoleId, 'patients:read');

    adminUserId = (
      await prisma.user.create({
        data: {
          hospitalId: hospitalA,
          roleId: adminRoleId,
          email: `admin-rbac-${runId}@test.com`,
          name: 'Admin',
          passwordHash: 'hash',
        },
      })
    ).id;

    limitedUserId = (
      await prisma.user.create({
        data: {
          hospitalId: hospitalA,
          branchId: branchA,
          roleId: limitedRoleId,
          email: `limited-rbac-${runId}@test.com`,
          name: 'Limited',
          passwordHash: 'hash',
        },
      })
    ).id;

    await prisma.role.create({
      data: { hospitalId: hospitalB, name: 'ADMIN', description: 'B admin' },
    });
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  itWithDb('ADMIN can list and read roles', async () => {
    const list = await rolesService.listRoles(adminActor());
    expect(list.length).toBeGreaterThanOrEqual(2);
    const detail = await rolesService.getRole(adminActor(), adminRoleId);
    expect(detail.name).toBe('ADMIN');
  });

  itWithDb('ADMIN can create, update, delete unassigned role', async () => {
    const created = await rolesService.createRole(adminActor(), {
      name: ' temp role ',
      description: 'Temp',
    });
    expect(created.name).toBe('TEMP_ROLE');

    const updated = await rolesService.updateRole(adminActor(), created.id, {
      description: 'Updated temp',
    });
    expect(updated.description).toBe('Updated temp');

    const deleted = await rolesService.deleteRole(adminActor(), created.id);
    expect(deleted.deleted).toBe(true);
  });

  itWithDb('duplicate role name rejected', async () => {
    await expect(
      rolesService.createRole(adminActor(), { name: 'ADMIN' }),
    ).rejects.toThrow(ConflictException);
  });

  itWithDb('delete role with users fails', async () => {
    await expect(
      rolesService.deleteRole(adminActor(), adminRoleId),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      rolesService.deleteRole(adminActor(), limitedRoleId),
    ).rejects.toThrow(ConflictException);
  });

  itWithDb('ADMIN cannot be renamed or stripped of RBAC perms', async () => {
    await expect(
      rolesService.updateRole(adminActor(), adminRoleId, { name: 'NOT_ADMIN' }),
    ).rejects.toThrow(ForbiddenException);

    const current = await rolesService.getRole(adminActor(), adminRoleId);
    const withoutManage = current.permissions
      .map((p) => p.name)
      .filter((name) => name !== 'roles:manage');

    await expect(
      rolesService.replaceRolePermissions(adminActor(), adminRoleId, {
        permissionNames: withoutManage,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  itWithDb('permission catalogue and atomic replacement', async () => {
    const catalogue = await rolesService.listPermissions();
    expect(catalogue.length).toBeGreaterThan(40);

    const targetRole = (
      await rolesService.createRole(adminActor(), {
        name: `PERM_${runId}`,
        description: 'perm test',
      })
    ).id;

    await rolesService.replaceRolePermissions(adminActor(), targetRole, {
      permissionNames: ['patients:read', 'opd:read'],
    });

    let detail = await rolesService.getRole(adminActor(), targetRole);
    expect(detail.permissions.map((p) => p.name).sort()).toEqual([
      'opd:read',
      'patients:read',
    ]);

    await expect(
      rolesService.replaceRolePermissions(adminActor(), targetRole, {
        permissionNames: ['patients:read', 'not-a-permission'],
      }),
    ).rejects.toThrow();

    detail = await rolesService.getRole(adminActor(), targetRole);
    expect(detail.permissions.map((p) => p.name).sort()).toEqual([
      'opd:read',
      'patients:read',
    ]);
  });

  itWithDb('cross-hospital role mutations fail', async () => {
    const roleB = await prisma.role.findFirstOrThrow({
      where: { hospitalId: hospitalB, name: 'ADMIN' },
    });

    await expect(rolesService.getRole(adminActor(), roleB.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      rolesService.updateRole(adminActor(), roleB.id, { description: 'x' }),
    ).rejects.toThrow(NotFoundException);
    await expect(rolesService.deleteRole(adminActor(), roleB.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      rolesService.replaceRolePermissions(adminActor(), roleB.id, {
        permissionNames: ['patients:read'],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  itWithDb('role mutations emit audit events', async () => {
    const auditRows = await prisma.auditLog.findMany({
      where: {
        hospitalId: hospitalA,
        action: {
          in: [
            ROLE_CREATED,
            ROLE_UPDATED,
            ROLE_DELETED,
            ROLE_PERMISSION_GRANTED,
            ROLE_PERMISSION_REVOKED,
          ],
        },
      },
    });
    expect(auditRows.length).toBeGreaterThan(0);
  });

  itWithDb('user role assignment same hospital and audit', async () => {
    const tempRole = (
      await rolesService.createRole(adminActor(), {
        name: `ASSIGN_${runId}`,
        description: 'assign',
      })
    ).id;
    await grant(tempRole, 'patients:read');

    const result = await usersService.assignRole(adminActor(), limitedUserId, {
      roleId: tempRole,
    });
    expect(result.roleId).toBe(tempRole);

    const auditRow = await prisma.auditLog.findFirst({
      where: {
        hospitalId: hospitalA,
        action: USER_ROLE_ASSIGNED,
        entityId: limitedUserId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
  });

  itWithDb('cross-hospital user role assignment fails', async () => {
    const roleB = await prisma.role.findFirstOrThrow({
      where: { hospitalId: hospitalB, name: 'ADMIN' },
    });
    await expect(
      usersService.assignRole(adminActor(), limitedUserId, { roleId: roleB.id }),
    ).rejects.toThrow(NotFoundException);
  });

  itWithDb('permissions guard enforces roles:read and roles:manage', async () => {
    const reflector = new Reflector();
    const guard = new PermissionsGuard(reflector, prisma as never);
    const handler = () => undefined;
    const ctx = {
      getHandler: () => handler,
      getClass: () => class T {},
      switchToHttp: () => ({
        getRequest: () => ({ user: limitedActor() }),
      }),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['roles:read']);
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(ForbiddenException);

    await grant(limitedRoleId, 'roles:read');
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['roles:manage']);
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(ForbiddenException);

    await grant(limitedRoleId, 'roles:manage');
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  itWithDb('users:manage required for user role assignment guard path', async () => {
    const reflector = new Reflector();
    const guard = new PermissionsGuard(reflector, prisma as never);
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class T {},
      switchToHttp: () => ({
        getRequest: () => ({ user: limitedActor() }),
      }),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['users:manage']);
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(ForbiddenException);

    await grant(limitedRoleId, 'users:manage');
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  itWithDb('permission grant and revoke audit rows recorded', async () => {
    const roleId = (
      await rolesService.createRole(adminActor(), {
        name: `AUDIT_PERM_${runId}`,
        description: 'audit perm',
      })
    ).id;

    await rolesService.replaceRolePermissions(adminActor(), roleId, {
      permissionNames: ['patients:read'],
    });

    const granted = await prisma.auditLog.findFirst({
      where: {
        hospitalId: hospitalA,
        entityId: roleId,
        action: ROLE_PERMISSION_GRANTED,
      },
    });
    expect(granted).not.toBeNull();

    await rolesService.replaceRolePermissions(adminActor(), roleId, {
      permissionNames: ['opd:read'],
    });

    const revokedRows = await prisma.auditLog.findMany({
      where: {
        hospitalId: hospitalA,
        entityId: roleId,
        action: ROLE_PERMISSION_REVOKED,
      },
    });
    expect(
      revokedRows.some(
        (row) =>
          row.metadata &&
          typeof row.metadata === 'object' &&
          'permissionName' in row.metadata &&
          (row.metadata as { permissionName?: string }).permissionName ===
            'patients:read',
      ),
    ).toBe(true);
  });

  itWithDb('ADMIN cannot be deleted', async () => {
    await expect(
      rolesService.deleteRole(adminActor(), adminRoleId),
    ).rejects.toThrow(ForbiddenException);
  });

  itWithDb('permission change applies on next guard check without re-login', async () => {
    const roleId = (
      await rolesService.createRole(adminActor(), {
        name: `LIVE_${runId}`,
        description: 'live',
      })
    ).id;

    const testUser = await prisma.user.create({
      data: {
        hospitalId: hospitalA,
        roleId,
        email: `live-${runId}@test.com`,
        name: 'Live',
        passwordHash: 'hash',
      },
    });

    const reflector = new Reflector();
    const guard = new PermissionsGuard(reflector, prisma as never);
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class T {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: testUser.id, hospitalId: hospitalA, roleId },
        }),
      }),
    };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:read']);
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(ForbiddenException);

    await rolesService.replaceRolePermissions(adminActor(), roleId, {
      permissionNames: ['patients:read'],
    });

    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  itWithDb('bootstrap is idempotent and preserves custom roles', async () => {
    const hospital = await prisma.hospital.create({
      data: { name: `Boot ${runId}`, code: `BOOT-${runId}` },
    });

    const first = await bootstrapHospitalRoleCatalogue(prisma, hospital.id);
    expect(first.createdRoleNames.length).toBe(DEFAULT_ROLE_TEMPLATES.length);
    expect(first.createdRoleNames.length).toBeGreaterThanOrEqual(25);

    const custom = await prisma.role.create({
      data: {
        hospitalId: hospital.id,
        name: `CUSTOM_BOOT_${runId}`,
        description: 'custom',
      },
    });
    await grant(custom.id, 'patients:update');

    const second = await bootstrapHospitalRoleCatalogue(prisma, hospital.id);
    expect(second.createdRoleNames).toHaveLength(0);

    const customAfter = await prisma.rolePermission.findMany({
      where: { roleId: custom.id },
      include: { permission: true },
    });
    expect(
      customAfter.some((rp) => rp.permission.name === 'patients:update'),
    ).toBe(true);
  });
});
