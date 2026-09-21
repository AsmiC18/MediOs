import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BedStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { BedQueryDto } from './dto/bed-query.dto';
import { CreateBedDto } from './dto/create-bed.dto';
import { UpdateBedDto } from './dto/update-bed.dto';
import { isAllowedBedStatusTransition } from './utils/bed-status-transitions.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class IpdBedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async validateBranch(user: AuthenticatedUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Branch does not belong to your hospital');
    }

    return branch;
  }

  async findOwnedBed(user: AuthenticatedUser, bedId: string) {
    const bed = await this.prisma.ipdBed.findUnique({
      where: { id: bedId },
      include: {
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!bed || bed.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Bed not found');
    }

    return bed;
  }

  async createBed(user: AuthenticatedUser, dto: CreateBedDto) {
    await this.validateBranch(user, dto.branchId);

    try {
      const bed = await this.prisma.ipdBed.create({
        data: {
          hospitalId: user.hospitalId,
          branchId: dto.branchId,
          wardName: dto.wardName.trim(),
          roomNumber: dto.roomNumber.trim(),
          bedNumber: dto.bedNumber.trim(),
          bedType: dto.bedType,
          notes: dto.notes,
        },
        include: {
          branch: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await this.auditService.log({
        action: 'IPD_BED_CREATED',
        entity: 'IpdBed',
        entityId: bed.id,
        hospitalId: user.hospitalId,
        branchId: bed.branchId,
        userId: user.sub,
        metadata: {
          wardName: bed.wardName,
          roomNumber: bed.roomNumber,
          bedNumber: bed.bedNumber,
          bedType: bed.bedType,
        },
      });

      return bed;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A bed with this ward/room/bed number already exists');
      }

      throw error;
    }
  }

  async listBeds(user: AuthenticatedUser, query: BedQueryDto = {}) {
    return this.prisma.ipdBed.findMany({
      where: {
        hospitalId: user.hospitalId,
        ...(query.branchId !== undefined && { branchId: query.branchId }),
        ...(query.wardName !== undefined && {
          wardName: { equals: query.wardName, mode: 'insensitive' },
        }),
        ...(query.status !== undefined && { status: query.status }),
        ...(query.bedType !== undefined && { bedType: query.bedType }),
      },
      include: {
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: [
        { wardName: 'asc' },
        { roomNumber: 'asc' },
        { bedNumber: 'asc' },
      ],
    });
  }

  async getBed(user: AuthenticatedUser, bedId: string) {
    return this.findOwnedBed(user, bedId);
  }

  async updateBed(user: AuthenticatedUser, bedId: string, dto: UpdateBedDto) {
    const existing = await this.findOwnedBed(user, bedId);

    if (dto.status !== undefined) {
      if (existing.status === BedStatus.OCCUPIED) {
        throw new BadRequestException(
          'Cannot change status of an occupied bed directly; discharge or transfer the patient first',
        );
      }

      if (
        !isAllowedBedStatusTransition(existing.status, dto.status) &&
        existing.status !== dto.status
      ) {
        throw new BadRequestException(
          `Invalid bed status transition from ${existing.status} to ${dto.status}`,
        );
      }
    }

    try {
      const bed = await this.prisma.ipdBed.update({
        where: { id: bedId },
        data: {
          ...(dto.wardName !== undefined && { wardName: dto.wardName.trim() }),
          ...(dto.roomNumber !== undefined && {
            roomNumber: dto.roomNumber.trim(),
          }),
          ...(dto.bedNumber !== undefined && { bedNumber: dto.bedNumber.trim() }),
          ...(dto.bedType !== undefined && { bedType: dto.bedType }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
        include: {
          branch: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await this.auditService.log({
        action: 'IPD_BED_UPDATED',
        entity: 'IpdBed',
        entityId: bed.id,
        hospitalId: user.hospitalId,
        branchId: bed.branchId,
        userId: user.sub,
        metadata: {
          previousStatus: existing.status,
          newStatus: bed.status,
        },
      });

      return bed;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A bed with this ward/room/bed number already exists');
      }

      throw error;
    }
  }

  async deactivateBed(user: AuthenticatedUser, bedId: string) {
    const existing = await this.findOwnedBed(user, bedId);

    if (existing.status === BedStatus.OCCUPIED) {
      throw new ConflictException('Cannot deactivate an occupied bed');
    }

    const bed = await this.prisma.ipdBed.update({
      where: { id: bedId },
      data: { status: BedStatus.INACTIVE },
      include: {
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    await this.auditService.log({
      action: 'IPD_BED_DEACTIVATED',
      entity: 'IpdBed',
      entityId: bed.id,
      hospitalId: user.hospitalId,
      branchId: bed.branchId,
      userId: user.sub,
    });

    return bed;
  }
}
