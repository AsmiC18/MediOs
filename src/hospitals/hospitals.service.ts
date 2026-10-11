import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import {
  BRANCH_CREATED,
  BRANCH_DEACTIVATED,
  BRANCH_UPDATED,
  HOSPITAL_UPDATED,
} from './tenant-audit.actions';

export type TenantAdminUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const hospitalSelect = {
  id: true,
  name: true,
  code: true,
  gstin: true,
  stateCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

const branchSelect = {
  id: true,
  hospitalId: true,
  name: true,
  code: true,
  address: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class HospitalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private assertHospitalId(user: TenantAdminUser, hospitalId: string): void {
    if (hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Access to this hospital is not permitted');
    }
  }

  async getHospital(user: TenantAdminUser, hospitalId: string) {
    this.assertHospitalId(user, hospitalId);

    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: hospitalSelect,
    });

    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }

    return hospital;
  }

  getMyHospital(user: TenantAdminUser) {
    return this.getHospital(user, user.hospitalId);
  }

  async updateHospital(
    user: TenantAdminUser,
    hospitalId: string,
    dto: UpdateHospitalDto,
  ) {
    this.assertHospitalId(user, hospitalId);

    const existing = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });

    if (!existing) {
      throw new NotFoundException('Hospital not found');
    }

    const data: Prisma.HospitalUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.gstin !== undefined) {
      data.gstin = dto.gstin?.trim() || null;
    }
    if (dto.stateCode !== undefined) {
      data.stateCode = dto.stateCode?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return this.getHospital(user, hospitalId);
    }

    const updated = await this.prisma.hospital.update({
      where: { id: hospitalId },
      data,
      select: hospitalSelect,
    });

    await this.auditService.log({
      action: HOSPITAL_UPDATED,
      entity: 'Hospital',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        fields: Object.keys(data),
      },
    });

    return updated;
  }

  updateMyHospital(user: TenantAdminUser, dto: UpdateHospitalDto) {
    return this.updateHospital(user, user.hospitalId, dto);
  }

  async listBranches(user: TenantAdminUser) {
    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
    });

    return this.prisma.branch.findMany({
      where,
      select: branchSelect,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async getBranch(user: TenantAdminUser, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        hospitalId: user.hospitalId,
      },
      select: branchSelect,
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    assertBranchAccess(user, branch.id);

    return branch;
  }

  async createBranch(user: TenantAdminUser, dto: CreateBranchDto) {
    if (user.branchId != null) {
      throw new ForbiddenException(
        'Only hospital-wide administrators can create branches',
      );
    }

    const name = dto.name.trim();
    const code = dto.code.trim().toUpperCase();
    const address = dto.address?.trim() || null;

    try {
      const branch = await this.prisma.branch.create({
        data: {
          hospitalId: user.hospitalId,
          name,
          code,
          address,
          isActive: true,
        },
        select: branchSelect,
      });

      await this.auditService.log({
        action: BRANCH_CREATED,
        entity: 'Branch',
        entityId: branch.id,
        hospitalId: user.hospitalId,
        branchId: branch.id,
        userId: user.sub,
        metadata: {
          code: branch.code,
          name: branch.name,
        },
      });

      return branch;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A branch with this code already exists in your hospital',
        );
      }
      throw error;
    }
  }

  private async assertCanDeactivate(branchId: string, hospitalId: string) {
    const activeUsers = await this.prisma.user.count({
      where: {
        hospitalId,
        branchId,
        status: 'ACTIVE',
      },
    });

    if (activeUsers > 0) {
      throw new BadRequestException(
        'Cannot deactivate a branch while active users are assigned to it',
      );
    }
  }

  async updateBranch(
    user: TenantAdminUser,
    branchId: string,
    dto: UpdateBranchDto,
  ) {
    const existing = await this.getBranch(user, branchId);

    if (dto.isActive === false && existing.isActive) {
      await this.assertCanDeactivate(branchId, user.hospitalId);
    }

    const data: Prisma.BranchUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.address !== undefined) {
      data.address = dto.address?.trim() || null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data,
      select: branchSelect,
    });

    const action =
      dto.isActive === false && existing.isActive
        ? BRANCH_DEACTIVATED
        : BRANCH_UPDATED;

    await this.auditService.log({
      action,
      entity: 'Branch',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.id,
      userId: user.sub,
      metadata: {
        fields: Object.keys(data),
        isActive: updated.isActive,
      },
    });

    return updated;
  }
}
