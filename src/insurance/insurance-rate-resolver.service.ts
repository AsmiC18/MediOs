import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { roundMoney } from '../billing/utils/money.util';
import {
  assertUsableEmpanelment,
  isEmpanelmentEffectiveOnDate,
} from './utils/empanelment.util';

export type ResolveInsuranceRateInput = {
  hospitalId: string;
  branchId?: string | null;
  providerId: string;
  empanelmentId: string;
  packageId: string;
  serviceCode: string;
  onDate?: Date;
};

export type ResolvedInsuranceRate = {
  rateId: string;
  packageId: string;
  serviceCode: string;
  serviceName: string;
  rate: Prisma.Decimal;
  currency: string;
};

@Injectable()
export class InsuranceRateResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveInsuranceRate(
    input: ResolveInsuranceRateInput,
  ): Promise<ResolvedInsuranceRate> {
    const onDate = input.onDate ?? new Date();

    const provider = await this.prisma.insuranceProvider.findFirst({
      where: { id: input.providerId, hospitalId: input.hospitalId, isActive: true },
    });
    if (!provider) {
      throw new NotFoundException('Insurance provider not found or inactive');
    }

    const empanelment = await this.prisma.insuranceEmpanelment.findFirst({
      where: { id: input.empanelmentId, hospitalId: input.hospitalId },
    });
    if (!empanelment) {
      throw new NotFoundException('Empanelment not found');
    }
    assertUsableEmpanelment(empanelment, {
      hospitalId: input.hospitalId,
      providerId: input.providerId,
      branchId: input.branchId,
      onDate,
    });

    const pkg = await this.prisma.insurancePackage.findFirst({
      where: {
        id: input.packageId,
        hospitalId: input.hospitalId,
        providerId: input.providerId,
        empanelmentId: input.empanelmentId,
        isActive: true,
      },
    });
    if (!pkg) {
      throw new NotFoundException('Insurance package not found or inactive');
    }

    const rates = await this.prisma.insurancePackageRate.findMany({
      where: {
        packageId: input.packageId,
        hospitalId: input.hospitalId,
        serviceCode: input.serviceCode.trim(),
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const match = rates.find((r) => isEmpanelmentEffectiveOnDate(r, onDate));
    if (!match) {
      throw new NotFoundException(
        `No active rate for service code ${input.serviceCode} on the requested date`,
      );
    }

    return {
      rateId: match.id,
      packageId: match.packageId,
      serviceCode: match.serviceCode,
      serviceName: match.serviceName,
      rate: roundMoney(match.rate),
      currency: match.currency,
    };
  }
}
