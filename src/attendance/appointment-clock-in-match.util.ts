import { AppointmentStatus, Prisma } from '@prisma/client';

const EXCLUDED_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.COMPLETED,
];

export function buildAppointmentMatchWhere(input: {
  hospitalId: string;
  resourceId: string;
  clockInAt: Date;
  attendanceBranchId?: string | null;
}): Prisma.AppointmentWhereInput {
  const branchScope: Prisma.AppointmentWhereInput =
    input.attendanceBranchId != null
      ? {
          OR: [
            { branchId: null },
            { branchId: input.attendanceBranchId },
          ],
        }
      : {};

  return {
    hospitalId: input.hospitalId,
    status: { notIn: EXCLUDED_APPOINTMENT_STATUSES },
    startAt: { lte: input.clockInAt },
    endAt: { gt: input.clockInAt },
    resources: {
      some: {
        resourceId: input.resourceId,
      },
    },
    ...branchScope,
  };
}
