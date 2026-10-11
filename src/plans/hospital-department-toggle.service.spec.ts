import { HospitalDepartmentKey } from '@prisma/client';
import { FeatureGateService } from './feature-gate.service';
import { FeatureKey } from './feature-keys';
import { FeatureNotEnabledException } from './feature-not-enabled.exception';
import { HospitalDepartmentToggleService } from './hospital-department-toggle.service';

describe('HospitalDepartmentToggleService + FeatureGateService', () => {
  const hospitalId = 'h1';

  it('blocks feature when department toggle disabled', async () => {
    const prisma = {
      hospitalPlan: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      hospitalDepartmentToggle: {
        findUnique: jest.fn().mockResolvedValue({
          enabled: false,
        }),
      },
    };
    const gate = new FeatureGateService(prisma as never);
    process.env.NODE_ENV = 'test';

    await expect(
      gate.assertEnabled(hospitalId, FeatureKey.OPD),
    ).rejects.toBeInstanceOf(FeatureNotEnabledException);
  });

  it('allows feature when toggle row missing (default enabled)', async () => {
    const prisma = {
      hospitalPlan: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      hospitalDepartmentToggle: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const gate = new FeatureGateService(prisma as never);
    process.env.NODE_ENV = 'test';

    await expect(gate.assertEnabled(hospitalId, FeatureKey.OPD)).resolves.toBeUndefined();
  });

  it('HospitalDepartmentToggleService upserts tenant-scoped row', async () => {
    const upsert = jest.fn().mockResolvedValue({ enabled: false });
    const service = new HospitalDepartmentToggleService(
      { hospitalDepartmentToggle: { upsert } } as never,
      { log: jest.fn() } as never,
    );

    await service.setToggle(
      { sub: 'u1', hospitalId },
      HospitalDepartmentKey.PHARMACY,
      false,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          hospitalId_departmentKey: {
            hospitalId,
            departmentKey: HospitalDepartmentKey.PHARMACY,
          },
        },
      }),
    );
  });
});
