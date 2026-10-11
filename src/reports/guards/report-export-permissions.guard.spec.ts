import { ForbiddenException } from '@nestjs/common';
import { ReportExportType } from '../dto/report-export.dto';
import { ReportExportPermissionsGuard } from './report-export-permissions.guard';

describe('ReportExportPermissionsGuard', () => {
  const prisma = {
    rolePermission: {
      findMany: jest.fn(),
    },
  };

  let guard: ReportExportPermissionsGuard;

  beforeEach(() => {
    guard = new ReportExportPermissionsGuard(prisma as never);
    prisma.rolePermission.findMany.mockReset();
  });

  function contextWithBody(type: ReportExportType) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { roleId: 'role-1' },
          body: { type },
        }),
      }),
    } as never;
  }

  it('requires insurance:reports:export for insurance ageing exports', async () => {
    prisma.rolePermission.findMany.mockResolvedValue([{ id: 'rp-1' }]);
    await expect(
      guard.canActivate(contextWithBody(ReportExportType.INSURANCE_AGEING)),
    ).resolves.toBe(true);

    expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
      where: {
        roleId: 'role-1',
        permission: { name: 'insurance:reports:export' },
      },
    });
  });

  it('requires reports:export for financial exports', async () => {
    prisma.rolePermission.findMany.mockResolvedValue([{ id: 'rp-1' }]);
    await expect(
      guard.canActivate(contextWithBody(ReportExportType.FINANCIAL)),
    ).resolves.toBe(true);

    expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
      where: {
        roleId: 'role-1',
        permission: { name: 'reports:export' },
      },
    });
  });

  it('denies when permission is missing', async () => {
    prisma.rolePermission.findMany.mockResolvedValue([]);
    await expect(
      guard.canActivate(contextWithBody(ReportExportType.PHARMACY_SHRINK)),
    ).rejects.toThrow(ForbiddenException);
  });
});
