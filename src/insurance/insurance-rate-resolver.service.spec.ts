import { NotFoundException } from '@nestjs/common';
import {
  InsuranceEmpanelmentStatus,
  InsuranceProviderType,
  Prisma,
} from '@prisma/client';
import { InsuranceRateResolverService } from './insurance-rate-resolver.service';

describe('InsuranceRateResolverService', () => {
  const hospitalId = 'h1';
  const providerId = 'prov1';
  const empanelmentId = 'emp1';
  const packageId = 'pkg1';

  it('returns active effective rate', async () => {
    const prisma = {
      insuranceProvider: {
        findFirst: jest.fn().mockResolvedValue({
          id: providerId,
          hospitalId,
          isActive: true,
        }),
      },
      insuranceEmpanelment: {
        findFirst: jest.fn().mockResolvedValue({
          id: empanelmentId,
          hospitalId,
          providerId,
          branchId: null,
          status: InsuranceEmpanelmentStatus.ACTIVE,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        }),
      },
      insurancePackage: {
        findFirst: jest.fn().mockResolvedValue({
          id: packageId,
          hospitalId,
          providerId,
          empanelmentId,
          isActive: true,
        }),
      },
      insurancePackageRate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rate1',
            packageId,
            serviceCode: 'CONSULT',
            serviceName: 'Consultation',
            rate: new Prisma.Decimal('500'),
            currency: 'INR',
            effectiveFrom: new Date('2026-01-01'),
            effectiveTo: null,
          },
        ]),
      },
    };

    const service = new InsuranceRateResolverService(prisma as never);
    const result = await service.resolveInsuranceRate({
      hospitalId,
      providerId,
      empanelmentId,
      packageId,
      serviceCode: 'CONSULT',
      onDate: new Date('2026-06-01'),
    });

    expect(result.rate.toFixed(2)).toBe('500.00');
    void InsuranceProviderType;
  });

  it('throws when rate expired', async () => {
    const prisma = {
      insuranceProvider: {
        findFirst: jest.fn().mockResolvedValue({ id: providerId, hospitalId, isActive: true }),
      },
      insuranceEmpanelment: {
        findFirst: jest.fn().mockResolvedValue({
          id: empanelmentId,
          hospitalId,
          providerId,
          branchId: null,
          status: InsuranceEmpanelmentStatus.ACTIVE,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        }),
      },
      insurancePackage: {
        findFirst: jest.fn().mockResolvedValue({
          id: packageId,
          hospitalId,
          providerId,
          empanelmentId,
          isActive: true,
        }),
      },
      insurancePackageRate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rate1',
            packageId,
            serviceCode: 'CONSULT',
            serviceName: 'Consultation',
            rate: new Prisma.Decimal('500'),
            currency: 'INR',
            effectiveFrom: new Date('2026-01-01'),
            effectiveTo: new Date('2026-03-01'),
          },
        ]),
      },
    };

    const service = new InsuranceRateResolverService(prisma as never);
    await expect(
      service.resolveInsuranceRate({
        hospitalId,
        providerId,
        empanelmentId,
        packageId,
        serviceCode: 'CONSULT',
        onDate: new Date('2026-06-01'),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
