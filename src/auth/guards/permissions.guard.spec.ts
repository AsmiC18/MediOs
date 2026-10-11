import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionsGuard } from './permissions.guard';

function mockExecutionContext(user: unknown): {
  switchToHttp: () => { getRequest: () => { user: unknown } };
  getHandler: () => unknown;
  getClass: () => unknown;
} {
  const handler = function handler() {};
  const controller = class MockController {};
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => handler,
    getClass: () => controller,
  };
}

describe('PermissionsGuard (unit)', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let prisma: { rolePermission: { findMany: jest.Mock } };

  beforeEach(() => {
    reflector = new Reflector();
    prisma = {
      rolePermission: {
        findMany: jest.fn(),
      },
    };
    guard = new PermissionsGuard(reflector, prisma as unknown as PrismaService);
  });

  it('returns 403 when user lacks audit:export', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['audit:export']);
    prisma.rolePermission.findMany.mockResolvedValue([]);

    await expect(
      guard.canActivate(mockExecutionContext({ roleId: 'role-1' }) as never),
    ).rejects.toThrow(new ForbiddenException('Insufficient permissions'));
  });

  it('allows when user has audit:read', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['audit:read']);
    prisma.rolePermission.findMany.mockResolvedValue([
      { permission: { name: 'audit:read' } },
    ]);

    const result = await guard.canActivate(
      mockExecutionContext({ roleId: 'role-1' }) as never,
    );

    expect(result).toBe(true);
  });

  it('allows when user has audit:export', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['audit:export']);
    prisma.rolePermission.findMany.mockResolvedValue([
      { permission: { name: 'audit:export' } },
    ]);

    const result = await guard.canActivate(
      mockExecutionContext({ roleId: 'role-1' }) as never,
    );

    expect(result).toBe(true);
  });

  it('allows when user has the required permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:read']);
    prisma.rolePermission.findMany.mockResolvedValue([
      { permission: { name: 'patients:read' } },
    ]);

    const result = await guard.canActivate(
      mockExecutionContext({ roleId: 'role-1' }) as never,
    );

    expect(result).toBe(true);
    expect(prisma.rolePermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roleId: 'role-1',
          permission: { name: { in: ['patients:read'] } },
        }),
      }),
    );
  });

  it('returns 403 when user lacks a required permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:read']);
    prisma.rolePermission.findMany.mockResolvedValue([]);

    await expect(
      guard.canActivate(mockExecutionContext({ roleId: 'role-1' }) as never),
    ).rejects.toThrow(new ForbiddenException('Insufficient permissions'));
  });

  it('requires all permissions (AND semantics)', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['patients:read', 'patients:update']);
    prisma.rolePermission.findMany.mockResolvedValue([
      { permission: { name: 'patients:read' } },
    ]);

    await expect(
      guard.canActivate(mockExecutionContext({ roleId: 'role-1' }) as never),
    ).rejects.toThrow(new ForbiddenException('Insufficient permissions'));
  });

  it('returns 403 when @RequirePermissions metadata is missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    await expect(
      guard.canActivate(mockExecutionContext({ roleId: 'role-1' }) as never),
    ).rejects.toThrow(
      new ForbiddenException(
        'Route requires @RequirePermissions when PermissionsGuard is applied',
      ),
    );
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when @RequirePermissions is an empty list', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    await expect(
      guard.canActivate(mockExecutionContext({ roleId: 'role-1' }) as never),
    ).rejects.toThrow(
      new ForbiddenException(
        'Route requires @RequirePermissions when PermissionsGuard is applied',
      ),
    );
  });

  it('returns 401 when permissions are required but user is absent', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:read']);

    await expect(
      guard.canActivate(mockExecutionContext(undefined) as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });
});
