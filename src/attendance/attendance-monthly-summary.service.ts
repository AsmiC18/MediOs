import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  aggregateAttendanceRows,
  resolvePreviousUtcCalendarMonth,
  UtcCalendarMonth,
} from './attendance-monthly-summary.util';

export type AttendanceMonthlySummaryJobPayload = {
  periodKey: string;
  periodYear: number;
  periodMonth: number;
};

@Injectable()
export class AttendanceMonthlySummaryService {
  constructor(private readonly prisma: PrismaService) {}

  resolvePeriodFromPayload(
    payload: AttendanceMonthlySummaryJobPayload | null | undefined,
  ): UtcCalendarMonth {
    if (
      payload?.periodYear &&
      payload?.periodMonth &&
      payload?.periodKey
    ) {
      const periodStart = new Date(
        Date.UTC(payload.periodYear, payload.periodMonth - 1, 1),
      );
      const periodEndExclusive = new Date(
        Date.UTC(payload.periodYear, payload.periodMonth, 1),
      );
      return {
        periodYear: payload.periodYear,
        periodMonth: payload.periodMonth,
        periodStart,
        periodEndExclusive,
        periodKey: payload.periodKey,
      };
    }

    return resolvePreviousUtcCalendarMonth();
  }

  async computeForHospital(
    hospitalId: string,
    period: UtcCalendarMonth,
  ): Promise<{ upserted: number }> {
    const attendances = await this.prisma.attendance.findMany({
      where: {
        hospitalId,
        date: {
          gte: period.periodStart,
          lt: period.periodEndExclusive,
        },
      },
      select: {
        userId: true,
        branchId: true,
        status: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
      },
    });

    const groups = new Map<
      string,
      {
        userId: string;
        branchId: string | null;
        rows: typeof attendances;
      }
    >();

    for (const row of attendances) {
      const key = `${row.userId}:${row.branchId ?? ''}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(row);
      } else {
        groups.set(key, {
          userId: row.userId,
          branchId: row.branchId,
          rows: [row],
        });
      }
    }

    let upserted = 0;

    for (const group of groups.values()) {
      const aggregate = aggregateAttendanceRows(group.rows);

      const existing = await this.prisma.attendanceMonthlySummary.findFirst({
        where: {
          hospitalId,
          branchId: group.branchId,
          userId: group.userId,
          periodYear: period.periodYear,
          periodMonth: period.periodMonth,
        },
      });

      if (existing) {
        await this.prisma.attendanceMonthlySummary.update({
          where: { id: existing.id },
          data: {
            ...aggregate,
            computedAt: new Date(),
          },
        });
      } else {
        await this.prisma.attendanceMonthlySummary.create({
          data: {
            hospitalId,
            branchId: group.branchId,
            userId: group.userId,
            periodYear: period.periodYear,
            periodMonth: period.periodMonth,
            ...aggregate,
          },
        });
      }

      upserted += 1;
    }

    return { upserted };
  }
}
