import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  Prisma,
  Resource,
  WorkSchedule,
} from '@prisma/client';
import { DateTime } from 'luxon';
import {
  parseHHmmToMinutes,
  resolveEffectiveWorkSchedule,
} from '../attendance/attendance-shift.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  assertAppointmentWithinLocalShift,
  localDaySlotBounds,
  rosterDateFromInstant,
} from './scheduling-calendar.util';
import {
  assertNoLeaveOverlapFound,
  buildActiveLeaveOverlapWhere,
  leaveAppliesToAppointmentBranch,
} from './scheduling-leave.util';
import {
  assertAdvanceBookingWindow,
  assertBookingRuleDuration,
  buildBufferedConflictTimeBounds,
} from './scheduling-booking-policy.util';
import { schedulingNow } from './scheduling-clock';
import { resolveEffectiveBookingRule } from './resolve-effective-booking-rule.util';

const NON_BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.COMPLETED,
];

export type SchedulingResourceInput = Pick<
  Resource,
  'id' | 'userId' | 'hospitalId' | 'branchId'
>;

@Injectable()
export class SchedulingPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveBranchWorkSchedule(
    client: PrismaService | Prisma.TransactionClient,
    hospitalId: string,
    branchId?: string | null,
  ): Promise<WorkSchedule | null> {
    return resolveEffectiveWorkSchedule(client, hospitalId, branchId);
  }

  async assertAppointmentBookingAllowed(
    client: PrismaService | Prisma.TransactionClient,
    input: {
      hospitalId: string;
      branchId?: string | null;
      startAt: Date;
      endAt: Date;
      resources: SchedulingResourceInput[];
      now?: Date;
    },
  ): Promise<void> {
    const now = input.now ?? schedulingNow();
    const bookingRule = await resolveEffectiveBookingRule(
      client,
      input.hospitalId,
      input.branchId,
    );

    if (bookingRule) {
      assertAdvanceBookingWindow(input.startAt, bookingRule, now);
      assertBookingRuleDuration(input.startAt, input.endAt, bookingRule);
    }

    await this.assertAppointmentCalendarAllowed(client, input);
  }

  async assertAppointmentCalendarAllowed(
    client: PrismaService | Prisma.TransactionClient,
    input: {
      hospitalId: string;
      branchId?: string | null;
      startAt: Date;
      endAt: Date;
      resources: SchedulingResourceInput[];
    },
  ): Promise<void> {
    const schedule = await resolveEffectiveWorkSchedule(
      client,
      input.hospitalId,
      input.branchId,
    );

    const timezone =
      schedule?.timezone?.trim() ||
      (await this.resolveTimezoneFallback(client, input.hospitalId, input.branchId));

    if (schedule) {
      assertAppointmentWithinLocalShift(input.startAt, input.endAt, {
        startTime: schedule.workStartTime,
        endTime: schedule.workEndTime,
        timezone: schedule.timezone,
      });
    }

    for (const resource of input.resources) {
      if (resource.hospitalId !== input.hospitalId) {
        throw new BadRequestException('Resource does not belong to this hospital.');
      }

      if (!resource.userId) {
        continue;
      }

      const rosterDate = rosterDateFromInstant(input.startAt, timezone);
      const roster = await client.rosterEntry.findUnique({
        where: {
          hospitalId_userId_date: {
            hospitalId: input.hospitalId,
            userId: resource.userId,
            date: rosterDate,
          },
        },
      });

      if (!roster) {
        continue;
      }

      if (roster.branchId != null && roster.branchId !== input.branchId) {
        throw new BadRequestException(
          'Provider is not rostered at this branch for the selected date.',
        );
      }

      assertAppointmentWithinLocalShift(input.startAt, input.endAt, {
        startTime: roster.shiftStartTime,
        endTime: roster.shiftEndTime,
        timezone,
      });
    }

    await this.assertProvidersNotOnLeave(client, input);
  }

  private async assertProvidersNotOnLeave(
    client: PrismaService | Prisma.TransactionClient,
    input: {
      hospitalId: string;
      branchId?: string | null;
      startAt: Date;
      endAt: Date;
      resources: SchedulingResourceInput[];
    },
  ): Promise<void> {
    for (const resource of input.resources) {
      if (!resource.userId) {
        continue;
      }

      const overlappingLeave = await client.leave.findFirst({
        where: buildActiveLeaveOverlapWhere({
          hospitalId: input.hospitalId,
          userId: resource.userId,
          startAt: input.startAt,
          endAt: input.endAt,
        }),
        select: { id: true, branchId: true },
      });

      if (
        overlappingLeave &&
        leaveAppliesToAppointmentBranch(
          overlappingLeave.branchId,
          input.branchId,
        )
      ) {
        assertNoLeaveOverlapFound(overlappingLeave);
      }
    }
  }

  async hasResourceSchedulingConflict(
    client: PrismaService | Prisma.TransactionClient,
    params: {
      hospitalId: string;
      resourceIds: string[];
      startAt: Date;
      endAt: Date;
      excludeAppointmentId?: string;
      bufferMinutes?: number;
    },
  ): Promise<boolean> {
    const bounds = buildBufferedConflictTimeBounds(
      params.startAt,
      params.endAt,
      params.bufferMinutes ?? 0,
    );

    const conflict = await client.appointment.findFirst({
      where: {
        hospitalId: params.hospitalId,
        ...(params.excludeAppointmentId && {
          id: { not: params.excludeAppointmentId },
        }),
        status: { notIn: NON_BLOCKING_APPOINTMENT_STATUSES },
        startAt: { lt: bounds.startUpper },
        endAt: { gt: bounds.endLower },
        resources: {
          some: { resourceId: { in: params.resourceIds } },
        },
      },
      select: { id: true },
    });
    return conflict != null;
  }

  async resolveEffectiveBookingRule(
    client: PrismaService | Prisma.TransactionClient,
    hospitalId: string,
    branchId?: string | null,
  ) {
    return resolveEffectiveBookingRule(client, hospitalId, branchId);
  }

  async generatePortalAvailableSlots(input: {
    hospitalId: string;
    branchId?: string | null;
    resourceIds: string[];
    /** Local calendar date (YYYY-MM-DD) in the effective work schedule timezone. */
    date: string;
    slotDurationMinutes: number;
    durationMinutes: number;
  }): Promise<{
    slots: { startAt: string; endAt: string }[];
    note: string;
    timezoneUsed: string | null;
  }> {
    const resources = await this.prisma.resource.findMany({
      where: { id: { in: input.resourceIds } },
    });

    const bookingRule = await resolveEffectiveBookingRule(
      this.prisma,
      input.hospitalId,
      input.branchId,
    );
    const now = schedulingNow();
    const bufferMinutes = bookingRule?.bufferMinutes ?? 0;

    const schedule = await resolveEffectiveWorkSchedule(
      this.prisma,
      input.hospitalId,
      input.branchId,
    );

    if (!schedule) {
      return this.generateUtcDaySlotsLegacy(input, resources, {
        now,
        bufferMinutes,
      });
    }

    const bounds = localDaySlotBounds(input.date, {
      startTime: schedule.workStartTime,
      endTime: schedule.workEndTime,
      timezone: schedule.timezone,
    });

    if (!bounds) {
      throw new BadRequestException(
        'Configured work schedule does not support same-day appointment slots.',
      );
    }

    const workStartMinutes = parseHHmmToMinutes(schedule.workStartTime);
    const workEndMinutes = parseHHmmToMinutes(schedule.workEndTime);
    const timezone = schedule.timezone;
    const dayStart = DateTime.fromISO(input.date, { zone: timezone }).startOf('day');

    const slots: { startAt: string; endAt: string }[] = [];

    for (
      let cursor = workStartMinutes;
      cursor + input.durationMinutes <= workEndMinutes;
      cursor += input.slotDurationMinutes
    ) {
      const startLocal = dayStart.plus({ minutes: cursor });
      const endLocal = startLocal.plus({ minutes: input.durationMinutes });
      const startAt = startLocal.toUTC().toJSDate();
      const endAt = endLocal.toUTC().toJSDate();

      try {
        await this.assertAppointmentBookingAllowed(this.prisma, {
          hospitalId: input.hospitalId,
          branchId: input.branchId,
          startAt,
          endAt,
          resources,
          now,
        });
      } catch {
        continue;
      }

      const conflict = await this.hasResourceSchedulingConflict(this.prisma, {
        hospitalId: input.hospitalId,
        resourceIds: input.resourceIds,
        startAt,
        endAt,
        bufferMinutes,
      });
      if (!conflict) {
        slots.push({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });
      }
    }

    return {
      slots,
      timezoneUsed: timezone,
      note:
        'Slots respect booking advance limits, branch/hospital work schedule, provider roster (when assigned), provider leave, duration rules, buffers, and resource conflicts.',
    };
  }

  private async generateUtcDaySlotsLegacy(
    input: {
      hospitalId: string;
      branchId?: string | null;
      resourceIds: string[];
      date: string;
      slotDurationMinutes: number;
      durationMinutes: number;
    },
    resources: Resource[],
    context: { now: Date; bufferMinutes: number },
  ): Promise<{
    slots: { startAt: string; endAt: string }[];
    note: string;
    timezoneUsed: string | null;
  }> {
    const dayStart = new Date(input.date);
    if (Number.isNaN(dayStart.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const slots: { startAt: string; endAt: string }[] = [];
    for (
      let cursor = dayStart.getTime();
      cursor + input.durationMinutes * 60_000 <= dayEnd.getTime();
      cursor += input.slotDurationMinutes * 60_000
    ) {
      const startAt = new Date(cursor);
      const endAt = new Date(cursor + input.durationMinutes * 60_000);

      try {
        await this.assertAppointmentBookingAllowed(this.prisma, {
          hospitalId: input.hospitalId,
          branchId: input.branchId,
          startAt,
          endAt,
          resources,
          now: context.now,
        });
      } catch {
        continue;
      }

      const conflict = await this.hasResourceSchedulingConflict(this.prisma, {
        hospitalId: input.hospitalId,
        resourceIds: input.resourceIds,
        startAt,
        endAt,
        bufferMinutes: context.bufferMinutes,
      });
      if (!conflict) {
        slots.push({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });
      }
    }

    return {
      slots,
      timezoneUsed: null,
      note:
        'No work schedule configured: slots use UTC day grid with advance limits, roster, leave, duration rules, buffers, and resource conflicts.',
    };
  }

  private async resolveTimezoneFallback(
    client: PrismaService | Prisma.TransactionClient,
    hospitalId: string,
    branchId?: string | null,
  ): Promise<string> {
    const schedule = await resolveEffectiveWorkSchedule(client, hospitalId, branchId);
    if (schedule?.timezone) {
      return schedule.timezone;
    }
    return 'UTC';
  }
}
