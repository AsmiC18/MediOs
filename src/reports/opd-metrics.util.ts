import {
  AppointmentStatus,
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  OpdQueueStatus,
  Prisma,
} from '@prisma/client';

export type OpdMetricsSummary = {
  from: string;
  to: string;
  branchId: string | null;
  queue: {
    timeBasis: 'OpdQueueEntry.queueDate';
    totalEntries: number;
    completed: number;
    noShow: number;
    waiting: number;
    inConsultation: number;
    called: number;
    cancelled: number;
  };
  appointments: {
    timeBasis: 'Appointment.startAt';
    totalScheduled: number;
    completed: number;
    noShow: number;
    cancelled: number;
  };
  encounters: {
    timeBasis: 'ClinicalEncounter.endedAt';
    opdCompleted: number;
  };
};

function branchFilter(branchId: string | null | undefined): { branchId?: string } {
  return branchId != null ? { branchId } : {};
}

export async function buildOpdMetricsSummary(
  prisma: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  input: {
    hospitalId: string;
    branchId?: string | null;
    from: string;
    to: string;
  },
): Promise<OpdMetricsSummary> {
  const from = new Date(input.from);
  const to = new Date(input.to);
  const scope = { hospitalId: input.hospitalId, ...branchFilter(input.branchId) };

  const queueWhere: Prisma.OpdQueueEntryWhereInput = {
    ...scope,
    queueDate: { gte: from, lt: to },
  };

  const [
    queueTotal,
    queueCompleted,
    queueNoShow,
    queueWaiting,
    queueInConsultation,
    queueCalled,
    queueCancelled,
    apptTotal,
    apptCompleted,
    apptNoShow,
    apptCancelled,
    opdEncountersCompleted,
  ] = await Promise.all([
    prisma.opdQueueEntry.count({ where: queueWhere }),
    prisma.opdQueueEntry.count({
      where: { ...queueWhere, status: OpdQueueStatus.COMPLETED },
    }),
    prisma.opdQueueEntry.count({
      where: { ...queueWhere, status: OpdQueueStatus.NO_SHOW },
    }),
    prisma.opdQueueEntry.count({
      where: { ...queueWhere, status: OpdQueueStatus.WAITING },
    }),
    prisma.opdQueueEntry.count({
      where: { ...queueWhere, status: OpdQueueStatus.IN_CONSULTATION },
    }),
    prisma.opdQueueEntry.count({
      where: { ...queueWhere, status: OpdQueueStatus.CALLED },
    }),
    prisma.opdQueueEntry.count({
      where: { ...queueWhere, status: OpdQueueStatus.CANCELLED },
    }),
    prisma.appointment.count({
      where: { ...scope, startAt: { gte: from, lt: to } },
    }),
    prisma.appointment.count({
      where: {
        ...scope,
        startAt: { gte: from, lt: to },
        status: AppointmentStatus.COMPLETED,
      },
    }),
    prisma.appointment.count({
      where: {
        ...scope,
        startAt: { gte: from, lt: to },
        status: AppointmentStatus.NO_SHOW,
      },
    }),
    prisma.appointment.count({
      where: {
        ...scope,
        startAt: { gte: from, lt: to },
        status: AppointmentStatus.CANCELLED,
      },
    }),
    prisma.clinicalEncounter.count({
      where: {
        ...scope,
        encounterType: ClinicalEncounterType.OPD,
        status: ClinicalEncounterStatus.COMPLETED,
        endedAt: { gte: from, lt: to },
      },
    }),
  ]);

  return {
    from: input.from,
    to: input.to,
    branchId: input.branchId ?? null,
    queue: {
      timeBasis: 'OpdQueueEntry.queueDate',
      totalEntries: queueTotal,
      completed: queueCompleted,
      noShow: queueNoShow,
      waiting: queueWaiting,
      inConsultation: queueInConsultation,
      called: queueCalled,
      cancelled: queueCancelled,
    },
    appointments: {
      timeBasis: 'Appointment.startAt',
      totalScheduled: apptTotal,
      completed: apptCompleted,
      noShow: apptNoShow,
      cancelled: apptCancelled,
    },
    encounters: {
      timeBasis: 'ClinicalEncounter.endedAt',
      opdCompleted: opdEncountersCompleted,
    },
  };
}
