import { Prisma } from '@prisma/client';

export type PatientCohortSummary = {
  from: string;
  to: string;
  branchId: string | null;
  timeBasis: {
    registration: 'Patient.createdAt';
    visits: 'Appointment.startAt';
  };
  totals: {
    registeredInRange: number;
    distinctPatientsWithVisits: number;
    newPatientsWithVisits: number;
    returningPatientsWithVisits: number;
  };
  byRegistrationMonth: Array<{
    month: string;
    registrations: number;
  }>;
};

function branchPatientFilter(
  branchId: string | null | undefined,
): Prisma.PatientWhereInput {
  return branchId != null ? { branchId } : {};
}

function branchAppointmentFilter(
  branchId: string | null | undefined,
): Prisma.AppointmentWhereInput {
  return branchId != null ? { branchId } : {};
}

export async function buildPatientCohortSummary(
  prisma: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  input: {
    hospitalId: string;
    branchId?: string | null;
    from: string;
    to: string;
  },
): Promise<PatientCohortSummary> {
  const from = new Date(input.from);
  const to = new Date(input.to);

  const patientScope: Prisma.PatientWhereInput = {
    hospitalId: input.hospitalId,
    anonymizedAt: null,
    ...branchPatientFilter(input.branchId),
  };

  const registeredInRange = await prisma.patient.count({
    where: {
      ...patientScope,
      createdAt: { gte: from, lt: to },
    },
  });

  const appointmentScope: Prisma.AppointmentWhereInput = {
    hospitalId: input.hospitalId,
    startAt: { gte: from, lt: to },
    ...branchAppointmentFilter(input.branchId),
  };

  const visitGroups = await prisma.appointment.groupBy({
    by: ['patientId'],
    where: appointmentScope,
    _count: { _all: true },
  });

  const patientIds = visitGroups.map((g) => g.patientId);
  let newPatientsWithVisits = 0;
  let returningPatientsWithVisits = 0;

  if (patientIds.length > 0) {
    const patients = await prisma.patient.findMany({
      where: { id: { in: patientIds }, hospitalId: input.hospitalId },
      select: { id: true, createdAt: true },
    });
    const createdAtById = new Map(patients.map((p) => [p.id, p.createdAt]));
    for (const patientId of patientIds) {
      const createdAt = createdAtById.get(patientId);
      if (!createdAt) {
        continue;
      }
      if (createdAt >= from && createdAt < to) {
        newPatientsWithVisits += 1;
      } else if (createdAt < from) {
        returningPatientsWithVisits += 1;
      }
    }
  }

  const registrationRows = await prisma.patient.findMany({
    where: {
      ...patientScope,
      createdAt: { gte: from, lt: to },
    },
    select: { createdAt: true },
  });

  const monthCounts = new Map<string, number>();
  for (const row of registrationRows) {
    const month = row.createdAt.toISOString().slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  const byRegistrationMonth = [...monthCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, registrations]) => ({ month, registrations }));

  return {
    from: input.from,
    to: input.to,
    branchId: input.branchId ?? null,
    timeBasis: {
      registration: 'Patient.createdAt',
      visits: 'Appointment.startAt',
    },
    totals: {
      registeredInRange,
      distinctPatientsWithVisits: patientIds.length,
      newPatientsWithVisits,
      returningPatientsWithVisits,
    },
    byRegistrationMonth,
  };
}
