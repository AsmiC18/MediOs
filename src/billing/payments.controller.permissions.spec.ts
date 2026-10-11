import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PERMISSIONS_KEY,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PrismaService } from '../common/prisma/prisma.service';

class PaymentsPermissionProbes {
  @RequirePermissions('payments:read')
  getPayment() {}
}

describe('PaymentsController permission metadata', () => {
  const paymentsControllerPath = join(__dirname, 'payments.controller.ts');

  it('wires JWT, permissions, and billing feature on PaymentsController', () => {
    const source = readFileSync(paymentsControllerPath, 'utf8');

    expect(source).toContain(
      '@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)',
    );
    expect(source).toContain('FeatureKey.BILLING');
    expect(source).not.toMatch(
      /@Get\(':id'\)[\s\S]*getPayment[\s\S]*@RequirePermissions\('refunds:read'\)/,
    );
  });

  it('requires payments:read on GET /payments/:id', () => {
    const source = readFileSync(paymentsControllerPath, 'utf8');
    expect(source).toMatch(
      /@Get\(':id'\)[\s\S]*@RequirePermissions\('payments:read'\)[\s\S]*getPayment/,
    );
  });

  it('keeps refunds:read on GET /payments/:id/refunds and refunds:manage on refund POST', () => {
    const source = readFileSync(paymentsControllerPath, 'utf8');
    expect(source).toMatch(
      /@Get\(':id\/refunds'\)[\s\S]*@RequirePermissions\('refunds:read'\)/,
    );
    expect(source).toMatch(
      /@Post\(':id\/refund'\)[\s\S]*@RequirePermissions\('refunds:manage'\)/,
    );
  });
});

describe('GET /payments/:id PermissionsGuard', () => {
  const reflector = new Reflector();
  let guard: PermissionsGuard;
  let prisma: { rolePermission: { findMany: jest.Mock } };
  const getPaymentHandler = PaymentsPermissionProbes.prototype.getPayment;

  beforeEach(() => {
    prisma = { rolePermission: { findMany: jest.fn() } };
    guard = new PermissionsGuard(reflector, prisma as unknown as PrismaService);
  });

  function executionContext(roleId: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user: { roleId, hospitalId: 'h-1' } }),
      }),
      getHandler: () => getPaymentHandler,
      getClass: () => PaymentsPermissionProbes,
    };
  }

  it('matches controller handler metadata for payments:read', () => {
    const source = readFileSync(
      join(__dirname, 'payments.controller.ts'),
      'utf8',
    );
    expect(source).toContain("@RequirePermissions('payments:read')");

    const required = reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      getPaymentHandler,
      PaymentsPermissionProbes,
    ]);
    expect(required).toEqual(['payments:read']);
  });

  it('allows user with payments:read', async () => {
    prisma.rolePermission.findMany.mockResolvedValue([
      { permission: { name: 'payments:read' } },
    ]);

    await expect(
      guard.canActivate(executionContext('role-with-read') as never),
    ).resolves.toBe(true);
    expect(prisma.rolePermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roleId: 'role-with-read',
          permission: { name: { in: ['payments:read'] } },
        }),
      }),
    );
  });

  it('returns 403 when user lacks payments:read', async () => {
    prisma.rolePermission.findMany.mockResolvedValue([]);

    await expect(
      guard.canActivate(executionContext('role-no-payments') as never),
    ).rejects.toThrow(new ForbiddenException('Insufficient permissions'));
  });
});
