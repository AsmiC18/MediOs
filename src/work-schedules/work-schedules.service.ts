import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

@Injectable()
export class WorkSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private validateTimezone(timezone: string): void {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
  }

  private validateWorkTimes(workStartTime: string, workEndTime: string): void {
    if (workStartTime === workEndTime) {
      throw new BadRequestException(
        'workStartTime and workEndTime must not be equal',
      );
    }
  }

  private async findOwnedSchedule(user: AuthenticatedUser, scheduleId: string) {
    const schedule = await this.prisma.workSchedule.findUnique({
      where: {
        id: scheduleId,
      },
    });

    if (!schedule || schedule.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Work schedule not found');
    }

    return schedule;
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

  async create(user: AuthenticatedUser, dto: CreateWorkScheduleDto) {
    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;
    this.validateTimezone(timezone);
    this.validateWorkTimes(dto.workStartTime, dto.workEndTime);

    const schedule = await this.prisma.workSchedule.create({
      data: {
        hospitalId: user.hospitalId,
        workStartTime: dto.workStartTime,
        workEndTime: dto.workEndTime,
        timezone,
      },
    });

    await this.auditService.log({
      action: 'WORK_SCHEDULE_CREATED',
      entity: 'WorkSchedule',
      entityId: schedule.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
    });

    return schedule;
  }

  async findAll(user: AuthenticatedUser) {
    return this.prisma.workSchedule.findMany({
      where: {
        hospitalId: user.hospitalId,
      },
      select: {
        id: true,
        hospitalId: true,
        workStartTime: true,
        workEndTime: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(user: AuthenticatedUser, scheduleId: string) {
    const schedule = await this.findOwnedSchedule(user, scheduleId);

    return {
      id: schedule.id,
      hospitalId: schedule.hospitalId,
      workStartTime: schedule.workStartTime,
      workEndTime: schedule.workEndTime,
      timezone: schedule.timezone,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }

  async update(
    user: AuthenticatedUser,
    scheduleId: string,
    dto: UpdateWorkScheduleDto,
  ) {
    const existing = await this.findOwnedSchedule(user, scheduleId);

    const workStartTime = dto.workStartTime ?? existing.workStartTime;
    const workEndTime = dto.workEndTime ?? existing.workEndTime;
    const timezone = dto.timezone ?? existing.timezone;

    this.validateWorkTimes(workStartTime, workEndTime);

    if (dto.timezone !== undefined) {
      this.validateTimezone(timezone);
    }

    const schedule = await this.prisma.workSchedule.update({
      where: {
        id: scheduleId,
      },
      data: {
        ...(dto.workStartTime !== undefined && {
          workStartTime: dto.workStartTime,
        }),
        ...(dto.workEndTime !== undefined && { workEndTime: dto.workEndTime }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      },
    });

    await this.auditService.log({
      action: 'WORK_SCHEDULE_UPDATED',
      entity: 'WorkSchedule',
      entityId: schedule.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
    });

    return {
      id: schedule.id,
      hospitalId: schedule.hospitalId,
      workStartTime: schedule.workStartTime,
      workEndTime: schedule.workEndTime,
      timezone: schedule.timezone,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }

  async remove(user: AuthenticatedUser, scheduleId: string) {
    await this.findOwnedSchedule(user, scheduleId);

    await this.prisma.$transaction(async (tx) => {
      await tx.hospital.updateMany({
        where: {
          defaultWorkScheduleId: scheduleId,
        },
        data: {
          defaultWorkScheduleId: null,
        },
      });

      await tx.branch.updateMany({
        where: {
          workScheduleId: scheduleId,
        },
        data: {
          workScheduleId: null,
        },
      });

      await tx.workSchedule.delete({
        where: {
          id: scheduleId,
        },
      });
    });

    await this.auditService.log({
      action: 'WORK_SCHEDULE_DELETED',
      entity: 'WorkSchedule',
      entityId: scheduleId,
      hospitalId: user.hospitalId,
      userId: user.sub,
    });

    return {
      id: scheduleId,
      deleted: true,
    };
  }

  async setHospitalDefault(user: AuthenticatedUser, scheduleId: string) {
    await this.findOwnedSchedule(user, scheduleId);

    await this.prisma.hospital.update({
      where: {
        id: user.hospitalId,
      },
      data: {
        defaultWorkScheduleId: scheduleId,
      },
    });

    await this.auditService.log({
      action: 'WORK_SCHEDULE_ASSIGNED_HOSPITAL_DEFAULT',
      entity: 'WorkSchedule',
      entityId: scheduleId,
      hospitalId: user.hospitalId,
      userId: user.sub,
    });

    return this.findOne(user, scheduleId);
  }

  async assignBranch(
    user: AuthenticatedUser,
    scheduleId: string,
    branchId: string,
  ) {
    await this.findOwnedSchedule(user, scheduleId);
    await this.findOwnedBranch(user, branchId);

    await this.prisma.branch.update({
      where: {
        id: branchId,
      },
      data: {
        workScheduleId: scheduleId,
      },
    });

    await this.auditService.log({
      action: 'WORK_SCHEDULE_ASSIGNED_BRANCH',
      entity: 'WorkSchedule',
      entityId: scheduleId,
      hospitalId: user.hospitalId,
      branchId,
      userId: user.sub,
    });

    return this.findOne(user, scheduleId);
  }

  async removeBranchOverride(user: AuthenticatedUser, branchId: string) {
    await this.findOwnedBranch(user, branchId);

    await this.prisma.branch.update({
      where: {
        id: branchId,
      },
      data: {
        workScheduleId: null,
      },
    });

    await this.auditService.log({
      action: 'WORK_SCHEDULE_BRANCH_OVERRIDE_REMOVED',
      entity: 'WorkSchedule',
      hospitalId: user.hospitalId,
      branchId,
      userId: user.sub,
    });

    return {
      branchId,
      workScheduleId: null,
    };
  }
}
