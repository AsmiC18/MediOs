import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
  resolveCreateBranchId,
  resolveUpdateBranchId,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  assertNoLeaveOverlapFound,
  buildActiveLeaveOverlapWhere,
} from '../scheduling/scheduling-leave.util';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { LeaveQueryDto } from './dto/leave-query.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { acquireProviderLeaveAdvisoryLock } from './leave-lock.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private assertValidInterval(startAt: Date, endAt: Date): void {
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }

  private async findOwnedUser(user: AuthenticatedUser, userId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser || targetUser.hospitalId !== user.hospitalId) {
      throw new NotFoundException('User not found');
    }

    return targetUser;
  }

  private async findOwnedBranch(user: AuthenticatedUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Branch not found');
    }

    assertBranchAccess(user, branch.id);

    return branch;
  }

  private async findOwnedLeave(user: AuthenticatedUser, leaveId: string) {
    const leave = await this.prisma.leave.findUnique({
      where: { id: leaveId },
    });

    if (!leave || leave.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Leave not found');
    }

    assertBranchAccess(user, leave.branchId);

    return leave;
  }

  private async assertNoOverlappingActiveLeave(
    tx: Prisma.TransactionClient,
    params: {
      hospitalId: string;
      userId: string;
      startAt: Date;
      endAt: Date;
      excludeLeaveId?: string;
    },
  ): Promise<void> {
    const overlapping = await tx.leave.findFirst({
      where: buildActiveLeaveOverlapWhere(params),
      select: { id: true },
    });
    assertNoLeaveOverlapFound(overlapping);
  }

  async create(user: AuthenticatedUser, dto: CreateLeaveDto) {
    await this.findOwnedUser(user, dto.userId);

    const branchId = resolveCreateBranchId(user, dto.branchId);
    if (branchId) {
      await this.findOwnedBranch(user, branchId);
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    this.assertValidInterval(startAt, endAt);

    const leave = await this.prisma.$transaction(async (tx) => {
      await acquireProviderLeaveAdvisoryLock(
        tx,
        user.hospitalId,
        dto.userId,
      );
      await this.assertNoOverlappingActiveLeave(tx, {
        hospitalId: user.hospitalId,
        userId: dto.userId,
        startAt,
        endAt,
      });

      return tx.leave.create({
        data: {
          hospitalId: user.hospitalId,
          branchId,
          userId: dto.userId,
          startAt,
          endAt,
          reason: dto.reason,
          status: LeaveStatus.ACTIVE,
        },
      });
    });

    await this.auditService.log({
      action: 'LEAVE_CREATED',
      entity: 'Leave',
      entityId: leave.id,
      hospitalId: user.hospitalId,
      branchId: leave.branchId,
      userId: user.sub,
    });

    return leave;
  }

  async findAll(user: AuthenticatedUser, query: LeaveQueryDto) {
    if (query.userId) {
      await this.findOwnedUser(user, query.userId);
    }

    if (user.branchId == null && query.branchId) {
      await this.findOwnedBranch(user, query.branchId);
    }

    const timeFilter: Prisma.DateTimeFilter = {};
    if (query.from !== undefined) {
      timeFilter.gte = new Date(query.from);
    }
    if (query.to !== undefined) {
      timeFilter.lte = new Date(query.to);
    }

    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      ...(query.userId !== undefined && { userId: query.userId }),
      ...(query.branchId !== undefined && { branchId: query.branchId }),
      ...(query.status !== undefined && { status: query.status }),
      ...(Object.keys(timeFilter).length > 0 && { startAt: timeFilter }),
    });

    return this.prisma.leave.findMany({
      where,
      orderBy: [{ startAt: 'desc' }],
    });
  }

  async findOne(user: AuthenticatedUser, leaveId: string) {
    return this.findOwnedLeave(user, leaveId);
  }

  async update(user: AuthenticatedUser, leaveId: string, dto: UpdateLeaveDto) {
    const existing = await this.findOwnedLeave(user, leaveId);

    if (existing.status !== LeaveStatus.ACTIVE) {
      throw new BadRequestException('Only active leave can be updated');
    }

    const nextBranchId = resolveUpdateBranchId(user, dto.branchId);
    if (nextBranchId) {
      await this.findOwnedBranch(user, nextBranchId);
    }

    const nextStartAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const nextEndAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    this.assertValidInterval(nextStartAt, nextEndAt);

    const leave = await this.prisma.$transaction(async (tx) => {
      await acquireProviderLeaveAdvisoryLock(
        tx,
        user.hospitalId,
        existing.userId,
      );
      await this.assertNoOverlappingActiveLeave(tx, {
        hospitalId: user.hospitalId,
        userId: existing.userId,
        startAt: nextStartAt,
        endAt: nextEndAt,
        excludeLeaveId: leaveId,
      });

      return tx.leave.update({
        where: { id: leaveId },
        data: {
          ...(nextBranchId !== undefined && { branchId: nextBranchId }),
          ...(dto.startAt !== undefined && { startAt: nextStartAt }),
          ...(dto.endAt !== undefined && { endAt: nextEndAt }),
          ...(dto.reason !== undefined && { reason: dto.reason }),
        },
      });
    });

    await this.auditService.log({
      action: 'LEAVE_UPDATED',
      entity: 'Leave',
      entityId: leave.id,
      hospitalId: user.hospitalId,
      branchId: leave.branchId,
      userId: user.sub,
    });

    return leave;
  }

  async cancel(user: AuthenticatedUser, leaveId: string) {
    const existing = await this.findOwnedLeave(user, leaveId);

    const leave = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.leave.updateMany({
        where: {
          id: leaveId,
          hospitalId: user.hospitalId,
          status: LeaveStatus.ACTIVE,
        },
        data: { status: LeaveStatus.CANCELLED },
      });

      const updated = await tx.leave.findUniqueOrThrow({
        where: { id: leaveId },
      });

      if (transition.count === 0 && updated.status !== LeaveStatus.CANCELLED) {
        throw new BadRequestException('Leave is not active');
      }

      return updated;
    });

    if (existing.status === LeaveStatus.ACTIVE) {
      await this.auditService.log({
        action: 'LEAVE_CANCELLED',
        entity: 'Leave',
        entityId: leave.id,
        hospitalId: user.hospitalId,
        branchId: leave.branchId,
        userId: user.sub,
      });
    }

    return leave;
  }
}
