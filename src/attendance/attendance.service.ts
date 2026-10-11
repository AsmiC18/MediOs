import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  Prisma,
  ResourceStatus,
  WorkSchedule,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { buildAppointmentMatchWhere } from './appointment-clock-in-match.util';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { buildStaffAttendanceConsultationDomainEvent } from './staff-attendance-consultation-event.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
  ) {}

  private normalizeAttendanceDate(referenceDate: Date = new Date()): Date {
    return new Date(
      Date.UTC(
        referenceDate.getUTCFullYear(),
        referenceDate.getUTCMonth(),
        referenceDate.getUTCDate(),
      ),
    );
  }

  private normalizeQueryDate(dateString: string): Date {
    return this.normalizeAttendanceDate(new Date(dateString));
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private parseHHmmToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private getLocalTimeMinutes(
    timestamp: Date,
    timezone: string,
  ): number | null {
    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const parts = formatter.formatToParts(timestamp);
      const hours = Number(parts.find((part) => part.type === 'hour')?.value);
      const minutes = Number(
        parts.find((part) => part.type === 'minute')?.value,
      );

      if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return null;
      }

      return hours * 60 + minutes;
    } catch {
      return null;
    }
  }

  private calculateLateMinutes(
    clockIn: Date,
    workStartTime: string,
    timezone: string,
  ): number {
    const clockInMinutes = this.getLocalTimeMinutes(clockIn, timezone);
    if (clockInMinutes === null) {
      return 0;
    }

    const startMinutes = this.parseHHmmToMinutes(workStartTime);
    if (clockInMinutes <= startMinutes) {
      return 0;
    }

    return clockInMinutes - startMinutes;
  }

  private calculateEarlyLeaveMinutes(
    clockOut: Date,
    workEndTime: string,
    timezone: string,
  ): number {
    const clockOutMinutes = this.getLocalTimeMinutes(clockOut, timezone);
    if (clockOutMinutes === null) {
      return 0;
    }

    const endMinutes = this.parseHHmmToMinutes(workEndTime);
    if (clockOutMinutes >= endMinutes) {
      return 0;
    }

    return endMinutes - clockOutMinutes;
  }

  private resolveArrivalStatus(lateMinutes: number): AttendanceStatus {
    return lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
  }

  private async resolveEffectiveWorkSchedule(
    hospitalId: string,
    branchId?: string | null,
  ): Promise<WorkSchedule | null> {
    if (branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: {
          id: branchId,
        },
        include: {
          workSchedule: true,
        },
      });

      if (!branch || branch.hospitalId !== hospitalId) {
        return null;
      }

      if (branch.workSchedule) {
        if (branch.workSchedule.hospitalId !== hospitalId) {
          return null;
        }

        return branch.workSchedule;
      }
    }

    const hospital = await this.prisma.hospital.findUnique({
      where: {
        id: hospitalId,
      },
      include: {
        defaultWorkSchedule: true,
      },
    });

    if (!hospital?.defaultWorkSchedule) {
      return null;
    }

    if (hospital.defaultWorkSchedule.hospitalId !== hospitalId) {
      return null;
    }

    return hospital.defaultWorkSchedule;
  }

  async clockIn(
    user: AuthenticatedUser,
    input: {
      locationLatitude?: number;
      locationLongitude?: number;
      locationLabel?: string;
    } = {},
  ) {
    const date = this.normalizeAttendanceDate();
    const now = new Date();
    const branchId = user.branchId ?? undefined;
    const schedule = await this.resolveEffectiveWorkSchedule(
      user.hospitalId,
      branchId,
    );

    let status: AttendanceStatus = AttendanceStatus.PRESENT;
    let lateMinutes = 0;

    if (schedule) {
      lateMinutes = this.calculateLateMinutes(
        now,
        schedule.workStartTime,
        schedule.timezone,
      );
      status = this.resolveArrivalStatus(lateMinutes);
    }

    try {
      const attendance = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.attendance.findUnique({
          where: {
            hospitalId_userId_date: {
              hospitalId: user.hospitalId,
              userId: user.sub,
              date,
            },
          },
        });

        if (existing) {
          throw new ConflictException(
            'Attendance record already exists for today',
          );
        }

        const created = await tx.attendance.create({
          data: {
            hospitalId: user.hospitalId,
            branchId,
            userId: user.sub,
            date,
            clockIn: now,
            status,
            lateMinutes,
            earlyLeaveMinutes: 0,
            clockInLatitude: input.locationLatitude ?? null,
            clockInLongitude: input.locationLongitude ?? null,
            clockInLocationLabel: input.locationLabel?.trim() || null,
          },
        });

        const resource = await tx.resource.findFirst({
          where: {
            hospitalId: user.hospitalId,
            userId: user.sub,
            status: ResourceStatus.ACTIVE,
          },
        });

        if (resource) {
          const appointment = await tx.appointment.findFirst({
            where: buildAppointmentMatchWhere({
              hospitalId: user.hospitalId,
              resourceId: resource.id,
              clockInAt: now,
              attendanceBranchId: branchId ?? null,
            }),
          });

          if (appointment) {
            const event = buildStaffAttendanceConsultationDomainEvent({
              attendanceId: created.id,
              userId: user.sub,
              resourceId: resource.id,
              appointment,
              clockInAt: now,
            });

            const outbox = await this.domainEventOutboxService.createInTransaction(
              tx,
              event,
            );

            await this.domainEventOutboxService.enqueueStaffAttendanceConsultationInTransaction(
              tx,
              {
                hospitalId: user.hospitalId,
                branchId: branchId ?? null,
                outboxId: outbox.id,
              },
            );
          }
        }

        return created;
      });

      await this.auditService.log({
        action: 'ATTENDANCE_CLOCK_IN',
        entity: 'Attendance',
        entityId: attendance.id,
        hospitalId: user.hospitalId,
        branchId: attendance.branchId,
        userId: user.sub,
      });

      return attendance;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'Attendance record already exists for today',
        );
      }

      throw error;
    }
  }

  async clockOut(user: AuthenticatedUser) {
    const date = this.normalizeAttendanceDate();

    const attendance = await this.prisma.attendance.findUnique({
      where: {
        hospitalId_userId_date: {
          hospitalId: user.hospitalId,
          userId: user.sub,
          date,
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found for today');
    }

    assertBranchAccess(user, attendance.branchId);

    if (!attendance.clockIn) {
      throw new BadRequestException('Clock-in time is missing for today');
    }

    if (attendance.clockOut) {
      throw new ConflictException('Already clocked out for today');
    }

    const now = new Date();
    const schedule = await this.resolveEffectiveWorkSchedule(
      user.hospitalId,
      attendance.branchId,
    );

    let earlyLeaveMinutes = 0;

    if (schedule) {
      earlyLeaveMinutes = this.calculateEarlyLeaveMinutes(
        now,
        schedule.workEndTime,
        schedule.timezone,
      );
    }

    const updatedAttendance = await this.prisma.attendance.update({
      where: {
        id: attendance.id,
      },
      data: {
        clockOut: now,
        earlyLeaveMinutes,
      },
    });

    await this.auditService.log({
      action: 'ATTENDANCE_CLOCK_OUT',
      entity: 'Attendance',
      entityId: updatedAttendance.id,
      hospitalId: user.hospitalId,
      branchId: updatedAttendance.branchId,
      userId: user.sub,
    });

    return updatedAttendance;
  }

  private async validateScopedUser(
    user: AuthenticatedUser,
    userId: string,
  ): Promise<void> {
    const targetUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!targetUser || targetUser.hospitalId !== user.hospitalId) {
      throw new NotFoundException('User not found');
    }
  }

  async findAll(user: AuthenticatedUser, query: AttendanceQueryDto) {
    if (query.userId) {
      await this.validateScopedUser(user, query.userId);
    }

    const dateFilter: Prisma.DateTimeFilter = {};

    if (query.fromDate !== undefined) {
      dateFilter.gte = this.normalizeQueryDate(query.fromDate);
    }

    if (query.toDate !== undefined) {
      dateFilter.lte = this.normalizeQueryDate(query.toDate);
    }

    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      ...(query.userId !== undefined && { userId: query.userId }),
      ...(query.branchId !== undefined && { branchId: query.branchId }),
      ...(query.status !== undefined && { status: query.status }),
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
    });

    return this.prisma.attendance.findMany({
      where,
      orderBy: [{ date: 'desc' }, { clockIn: 'desc' }],
    });
  }

  async findOne(user: AuthenticatedUser, attendanceId: string) {
    const attendance = await this.prisma.attendance.findUnique({
      where: {
        id: attendanceId,
      },
    });

    if (!attendance || attendance.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Attendance record not found');
    }

    assertBranchAccess(user, attendance.branchId);

    return attendance;
  }
}
