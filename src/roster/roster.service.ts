import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateRosterEntryDto } from './dto/create-roster-entry.dto';
import { RosterEntryQueryDto } from './dto/roster-entry-query.dto';
import { UpdateRosterEntryDto } from './dto/update-roster-entry.dto';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class RosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private normalizeRosterDate(dateString: string): Date {
    return new Date(
      Date.UTC(
        new Date(dateString).getUTCFullYear(),
        new Date(dateString).getUTCMonth(),
        new Date(dateString).getUTCDate(),
      ),
    );
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private validateShiftTimes(shiftStartTime: string, shiftEndTime: string): void {
    if (shiftStartTime === shiftEndTime) {
      throw new BadRequestException(
        'shiftStartTime and shiftEndTime must not be equal',
      );
    }

    if (shiftStartTime >= shiftEndTime) {
      throw new BadRequestException('shiftStartTime must be before shiftEndTime');
    }
  }

  private async findOwnedUser(user: AuthenticatedUser, userId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!targetUser || targetUser.hospitalId !== user.hospitalId) {
      throw new NotFoundException('User not found');
    }

    return targetUser;
  }

  private async findOwnedBranch(user: AuthenticatedUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: {
        id: branchId,
      },
    });

    if (!branch || branch.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  private async findOwnedEntry(user: AuthenticatedUser, entryId: string) {
    const entry = await this.prisma.rosterEntry.findUnique({
      where: {
        id: entryId,
      },
    });

    if (!entry || entry.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Roster entry not found');
    }

    return entry;
  }

  private async assertNoDuplicateEntry(
    hospitalId: string,
    userId: string,
    date: Date,
    excludeEntryId?: string,
  ): Promise<void> {
    const existing = await this.prisma.rosterEntry.findUnique({
      where: {
        hospitalId_userId_date: {
          hospitalId,
          userId,
          date,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing && existing.id !== excludeEntryId) {
      throw new ConflictException(
        'Roster entry already exists for this user on this date',
      );
    }
  }

  async create(user: AuthenticatedUser, dto: CreateRosterEntryDto) {
    await this.findOwnedUser(user, dto.userId);

    if (dto.branchId) {
      await this.findOwnedBranch(user, dto.branchId);
    }

    this.validateShiftTimes(dto.shiftStartTime, dto.shiftEndTime);

    const date = this.normalizeRosterDate(dto.date);
    await this.assertNoDuplicateEntry(user.hospitalId, dto.userId, date);

    try {
      const entry = await this.prisma.rosterEntry.create({
        data: {
          hospitalId: user.hospitalId,
          branchId: dto.branchId,
          userId: dto.userId,
          date,
          shiftStartTime: dto.shiftStartTime,
          shiftEndTime: dto.shiftEndTime,
          notes: dto.notes,
        },
      });

      await this.auditService.log({
        action: 'ROSTER_ENTRY_CREATED',
        entity: 'RosterEntry',
        entityId: entry.id,
        hospitalId: user.hospitalId,
        branchId: entry.branchId,
        userId: user.sub,
      });

      return entry;
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'Roster entry already exists for this user on this date',
        );
      }

      throw error;
    }
  }

  async findAll(user: AuthenticatedUser, query: RosterEntryQueryDto) {
    if (query.userId) {
      await this.findOwnedUser(user, query.userId);
    }

    if (query.branchId) {
      await this.findOwnedBranch(user, query.branchId);
    }

    const dateFilter: Prisma.DateTimeFilter = {};

    if (query.fromDate !== undefined) {
      dateFilter.gte = this.normalizeRosterDate(query.fromDate);
    }

    if (query.toDate !== undefined) {
      dateFilter.lte = this.normalizeRosterDate(query.toDate);
    }

    return this.prisma.rosterEntry.findMany({
      where: {
        hospitalId: user.hospitalId,
        ...(query.userId !== undefined && { userId: query.userId }),
        ...(query.branchId !== undefined && { branchId: query.branchId }),
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
      orderBy: [{ date: 'desc' }, { shiftStartTime: 'asc' }],
    });
  }

  async findOne(user: AuthenticatedUser, entryId: string) {
    return this.findOwnedEntry(user, entryId);
  }

  async update(
    user: AuthenticatedUser,
    entryId: string,
    dto: UpdateRosterEntryDto,
  ) {
    const existing = await this.findOwnedEntry(user, entryId);

    if (dto.userId) {
      await this.findOwnedUser(user, dto.userId);
    }

    if (dto.branchId) {
      await this.findOwnedBranch(user, dto.branchId);
    }

    const nextUserId = dto.userId ?? existing.userId;
    const nextDate =
      dto.date !== undefined
        ? this.normalizeRosterDate(dto.date)
        : existing.date;
    const nextShiftStartTime = dto.shiftStartTime ?? existing.shiftStartTime;
    const nextShiftEndTime = dto.shiftEndTime ?? existing.shiftEndTime;

    this.validateShiftTimes(nextShiftStartTime, nextShiftEndTime);

    if (dto.userId !== undefined || dto.date !== undefined) {
      await this.assertNoDuplicateEntry(
        user.hospitalId,
        nextUserId,
        nextDate,
        entryId,
      );
    }

    try {
      const entry = await this.prisma.rosterEntry.update({
        where: {
          id: entryId,
        },
        data: {
          ...(dto.userId !== undefined && { userId: dto.userId }),
          ...(dto.branchId !== undefined && { branchId: dto.branchId }),
          ...(dto.date !== undefined && { date: nextDate }),
          ...(dto.shiftStartTime !== undefined && {
            shiftStartTime: dto.shiftStartTime,
          }),
          ...(dto.shiftEndTime !== undefined && {
            shiftEndTime: dto.shiftEndTime,
          }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      });

      await this.auditService.log({
        action: 'ROSTER_ENTRY_UPDATED',
        entity: 'RosterEntry',
        entityId: entry.id,
        hospitalId: user.hospitalId,
        branchId: entry.branchId,
        userId: user.sub,
      });

      return entry;
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'Roster entry already exists for this user on this date',
        );
      }

      throw error;
    }
  }

  async remove(user: AuthenticatedUser, entryId: string) {
    await this.findOwnedEntry(user, entryId);

    await this.prisma.rosterEntry.delete({
      where: {
        id: entryId,
      },
    });

    await this.auditService.log({
      action: 'ROSTER_ENTRY_DELETED',
      entity: 'RosterEntry',
      entityId: entryId,
      hospitalId: user.hospitalId,
      userId: user.sub,
    });

    return {
      id: entryId,
      deleted: true,
    };
  }
}
