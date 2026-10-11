import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { roundMoney, toDecimal } from '../billing/utils/money.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateInsurancePackageDto,
  CreateInsurancePackageRateDto,
  PackageQueryDto,
  UpdateInsurancePackageDto,
  UpdateInsurancePackageRateDto,
} from './dto/package.dto';
import { assertUsableEmpanelment } from './utils/empanelment.util';
import { isEmpanelmentEffectiveOnDate } from './utils/empanelment.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class InsurancePackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async findOwnedProvider(user: AuthenticatedUser, providerId: string) {
    const provider = await this.prisma.insuranceProvider.findFirst({
      where: { id: providerId, hospitalId: user.hospitalId },
    });
    if (!provider) {
      throw new NotFoundException('Insurance provider not found');
    }
    return provider;
  }

  private async findOwnedEmpanelment(user: AuthenticatedUser, empanelmentId: string) {
    const empanelment = await this.prisma.insuranceEmpanelment.findFirst({
      where: { id: empanelmentId, hospitalId: user.hospitalId },
    });
    if (!empanelment) {
      throw new NotFoundException('Empanelment not found');
    }
    return empanelment;
  }

  async createPackage(user: AuthenticatedUser, dto: CreateInsurancePackageDto) {
    await this.findOwnedProvider(user, dto.providerId);
    const empanelment = await this.findOwnedEmpanelment(user, dto.empanelmentId);

    if (empanelment.providerId !== dto.providerId) {
      throw new BadRequestException('Empanelment does not belong to the provider');
    }

    assertUsableEmpanelment(empanelment, {
      hospitalId: user.hospitalId,
      providerId: dto.providerId,
      branchId: user.branchId,
    });

    try {
      const pkg = await this.prisma.insurancePackage.create({
        data: {
          hospitalId: user.hospitalId,
          providerId: dto.providerId,
          empanelmentId: dto.empanelmentId,
          code: dto.code.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim(),
        },
      });

      await this.auditService.log({
        action: 'INSURANCE_PACKAGE_CREATED',
        entity: 'InsurancePackage',
        entityId: pkg.id,
        hospitalId: user.hospitalId,
        userId: user.sub,
        metadata: { code: pkg.code, empanelmentId: pkg.empanelmentId },
      });

      return pkg;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Package code already exists for this empanelment');
      }
      throw error;
    }
  }

  async listPackages(user: AuthenticatedUser, query: PackageQueryDto) {
    const where: Prisma.InsurancePackageWhereInput = {
      hospitalId: user.hospitalId,
    };
    if (query.providerId) {
      await this.findOwnedProvider(user, query.providerId);
      where.providerId = query.providerId;
    }
    if (query.empanelmentId) {
      await this.findOwnedEmpanelment(user, query.empanelmentId);
      where.empanelmentId = query.empanelmentId;
    }

    return this.prisma.insurancePackage.findMany({
      where,
      orderBy: { code: 'asc' },
    });
  }

  async getPackage(user: AuthenticatedUser, id: string) {
    const pkg = await this.prisma.insurancePackage.findFirst({
      where: { id, hospitalId: user.hospitalId },
      include: { rates: { orderBy: { effectiveFrom: 'desc' } } },
    });
    if (!pkg) {
      throw new NotFoundException('Insurance package not found');
    }
    return pkg;
  }

  async updatePackage(user: AuthenticatedUser, id: string, dto: UpdateInsurancePackageDto) {
    await this.getPackage(user, id);
    const pkg = await this.prisma.insurancePackage.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        isActive: dto.isActive,
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_PACKAGE_UPDATED',
      entity: 'InsurancePackage',
      entityId: pkg.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
      metadata: { isActive: pkg.isActive },
    });

    return pkg;
  }

  private async assertNoOverlappingRate(
    packageId: string,
    serviceCode: string,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeRateId?: string,
  ) {
    const existing = await this.prisma.insurancePackageRate.findMany({
      where: {
        packageId,
        serviceCode,
        ...(excludeRateId ? { id: { not: excludeRateId } } : {}),
      },
    });

    for (const rate of existing) {
      const aFrom = effectiveFrom.getTime();
      const aTo = effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
      const bFrom = rate.effectiveFrom.getTime();
      const bTo = rate.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aFrom <= bTo && bFrom <= aTo) {
        throw new ConflictException(
          `Overlapping rate exists for service code ${serviceCode}`,
        );
      }
    }
  }

  async createRate(user: AuthenticatedUser, packageId: string, dto: CreateInsurancePackageRateDto) {
    const pkg = await this.getPackage(user, packageId);
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;

    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom');
    }

    await this.assertNoOverlappingRate(
      packageId,
      dto.serviceCode.trim(),
      effectiveFrom,
      effectiveTo,
    );

    const rate = await this.prisma.insurancePackageRate.create({
      data: {
        packageId,
        hospitalId: user.hospitalId,
        serviceCode: dto.serviceCode.trim(),
        serviceName: dto.serviceName.trim(),
        rate: roundMoney(toDecimal(dto.rate)),
        currency: dto.currency?.trim() || 'INR',
        effectiveFrom,
        effectiveTo,
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_PACKAGE_RATE_CREATED',
      entity: 'InsurancePackageRate',
      entityId: rate.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
      metadata: {
        packageId,
        serviceCode: rate.serviceCode,
        providerId: pkg.providerId,
      },
    });

    return rate;
  }

  async updateRate(
    user: AuthenticatedUser,
    packageId: string,
    rateId: string,
    dto: UpdateInsurancePackageRateDto,
  ) {
    await this.getPackage(user, packageId);
    const existing = await this.prisma.insurancePackageRate.findFirst({
      where: { id: rateId, packageId, hospitalId: user.hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('Package rate not found');
    }

    const effectiveTo =
      dto.effectiveTo !== undefined
        ? dto.effectiveTo
          ? new Date(dto.effectiveTo)
          : null
        : existing.effectiveTo;

    if (effectiveTo && effectiveTo < existing.effectiveFrom) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom');
    }

    await this.assertNoOverlappingRate(
      packageId,
      existing.serviceCode,
      existing.effectiveFrom,
      effectiveTo,
      rateId,
    );

    const rate = await this.prisma.insurancePackageRate.update({
      where: { id: rateId },
      data: {
        serviceName: dto.serviceName?.trim(),
        rate: dto.rate != null ? roundMoney(toDecimal(dto.rate)) : undefined,
        effectiveTo,
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_PACKAGE_RATE_UPDATED',
      entity: 'InsurancePackageRate',
      entityId: rate.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
      metadata: { packageId, serviceCode: rate.serviceCode },
    });

    return rate;
  }

  assertSelectablePackage(
    pkg: { isActive: boolean; empanelmentId: string },
    empanelment: Parameters<typeof assertUsableEmpanelment>[0],
    ctx: Parameters<typeof assertUsableEmpanelment>[1],
  ) {
    if (!pkg.isActive) {
      throw new BadRequestException('Insurance package is not active');
    }
    assertUsableEmpanelment(empanelment, ctx);
  }

  isRateEffectiveOnDate(
    rate: { effectiveFrom: Date; effectiveTo: Date | null },
    onDate: Date,
  ): boolean {
    return isEmpanelmentEffectiveOnDate(rate, onDate);
  }
}
