import { Prisma, WorkSchedule } from '@prisma/client';

export type EffectiveShift = {
  workStartTime: string;
  workEndTime: string;
  timezone: string;
  source: 'roster' | 'work_schedule';
};

export function parseHHmmToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getLocalTimeMinutes(
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

export function calculateLateMinutes(
  clockIn: Date,
  workStartTime: string,
  timezone: string,
): number {
  const clockInMinutes = getLocalTimeMinutes(clockIn, timezone);
  if (clockInMinutes === null) {
    return 0;
  }

  const startMinutes = parseHHmmToMinutes(workStartTime);
  if (clockInMinutes <= startMinutes) {
    return 0;
  }

  return clockInMinutes - startMinutes;
}

export function calculateEarlyLeaveMinutes(
  clockOut: Date,
  workEndTime: string,
  timezone: string,
): number {
  const clockOutMinutes = getLocalTimeMinutes(clockOut, timezone);
  if (clockOutMinutes === null) {
    return 0;
  }

  const endMinutes = parseHHmmToMinutes(workEndTime);
  if (clockOutMinutes >= endMinutes) {
    return 0;
  }

  return endMinutes - clockOutMinutes;
}

export async function resolveEffectiveWorkSchedule(
  client: Prisma.TransactionClient | { branch: { findUnique: Function }; hospital: { findUnique: Function } },
  hospitalId: string,
  branchId?: string | null,
): Promise<WorkSchedule | null> {
  if (branchId) {
    const branch = await client.branch.findUnique({
      where: { id: branchId },
      include: { workSchedule: true },
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

  const hospital = await client.hospital.findUnique({
    where: { id: hospitalId },
    include: { defaultWorkSchedule: true },
  });

  if (!hospital?.defaultWorkSchedule) {
    return null;
  }

  if (hospital.defaultWorkSchedule.hospitalId !== hospitalId) {
    return null;
  }

  return hospital.defaultWorkSchedule;
}

export async function resolveEffectiveShift(
  client: Prisma.TransactionClient,
  input: {
    hospitalId: string;
    userId: string;
    date: Date;
    branchId?: string | null;
  },
): Promise<EffectiveShift | null> {
  const schedule = await resolveEffectiveWorkSchedule(
    client,
    input.hospitalId,
    input.branchId,
  );

  const roster = await client.rosterEntry.findUnique({
    where: {
      hospitalId_userId_date: {
        hospitalId: input.hospitalId,
        userId: input.userId,
        date: input.date,
      },
    },
  });

  if (roster) {
    const timezone = schedule?.timezone ?? 'UTC';
    return {
      workStartTime: roster.shiftStartTime,
      workEndTime: roster.shiftEndTime,
      timezone,
      source: 'roster',
    };
  }

  if (schedule) {
    return {
      workStartTime: schedule.workStartTime,
      workEndTime: schedule.workEndTime,
      timezone: schedule.timezone,
      source: 'work_schedule',
    };
  }

  return null;
}
