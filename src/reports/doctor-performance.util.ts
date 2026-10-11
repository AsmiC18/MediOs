import { AppointmentStatus, ClinicalEncounterStatus, Prisma } from '@prisma/client';

export type DoctorPerformanceRow = {
  providerUserId: string;
  completedEncounters: number;
  appointmentsScheduled: number;
  appointmentNoShows: number;
};

export type DoctorPerformanceSummary = {
  from: string;
  to: string;
  branchId: string | null;
  doctors: DoctorPerformanceRow[];
};

function branchFilter(branchId: string | null | undefined): { branchId?: string } {
  return branchId != null ? { branchId } : {};
}

export async function buildDoctorPerformanceSummary(
  prisma: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  input: {
    hospitalId: string;
    branchId?: string | null;
    from: string;
    to: string;
  },
): Promise<DoctorPerformanceSummary> {
  const from = new Date(input.from);
  const to = new Date(input.to);
  const scope = { hospitalId: input.hospitalId, ...branchFilter(input.branchId) };

  const encounterGroups = await prisma.clinicalEncounter.groupBy({
    by: ['providerUserId'],
    where: {
      ...scope,
      status: ClinicalEncounterStatus.COMPLETED,
      endedAt: { gte: from, lt: to },
    },
    _count: { _all: true },
  });

  const resources = await prisma.resource.findMany({
    where: {
      ...scope,
      userId: { not: null },
    },
    select: { id: true, userId: true },
  });

  const resourceIds = resources.map((r) => r.id);
  const userByResource = new Map(resources.map((r) => [r.id, r.userId!]));

  const appointmentCounts = new Map<string, { scheduled: number; noShow: number }>();

  if (resourceIds.length > 0) {
    const links = await prisma.appointmentResource.findMany({
      where: {
        resourceId: { in: resourceIds },
        appointment: {
          ...scope,
          startAt: { gte: from, lt: to },
        },
      },
      select: {
        resourceId: true,
        appointment: { select: { status: true } },
      },
    });

    for (const link of links) {
      const userId = userByResource.get(link.resourceId);
      if (!userId) {
        continue;
      }
      const bucket = appointmentCounts.get(userId) ?? { scheduled: 0, noShow: 0 };
      bucket.scheduled += 1;
      if (link.appointment.status === AppointmentStatus.NO_SHOW) {
        bucket.noShow += 1;
      }
      appointmentCounts.set(userId, bucket);
    }
  }

  const doctorIds = new Set<string>();
  for (const row of encounterGroups) {
    doctorIds.add(row.providerUserId);
  }
  for (const userId of appointmentCounts.keys()) {
    doctorIds.add(userId);
  }

  const doctors: DoctorPerformanceRow[] = [...doctorIds].map((providerUserId) => {
    const enc =
      encounterGroups.find((g) => g.providerUserId === providerUserId)?._count._all ?? 0;
    const appt = appointmentCounts.get(providerUserId);
    return {
      providerUserId,
      completedEncounters: enc,
      appointmentsScheduled: appt?.scheduled ?? 0,
      appointmentNoShows: appt?.noShow ?? 0,
    };
  });

  doctors.sort((a, b) => a.providerUserId.localeCompare(b.providerUserId));

  return {
    from: input.from,
    to: input.to,
    branchId: input.branchId ?? null,
    doctors,
  };
}
