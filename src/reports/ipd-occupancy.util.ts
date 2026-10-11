import { BedStatus, IpdAdmissionStatus, Prisma } from '@prisma/client';

export type IpdOccupancySummary = {
  asOf: string;
  branchId: string | null;
  timeBasis: 'point-in-time using IpdBedAssignment.assignedAt/releasedAt and IpdAdmission dates';
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  maintenanceBeds: number;
  inactiveBeds: number;
  occupancyRate: string | null;
  activeAdmissions: number;
};

function branchFilter(branchId: string | null | undefined): { branchId?: string } {
  return branchId != null ? { branchId } : {};
}

export async function buildIpdOccupancySummary(
  prisma: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  input: {
    hospitalId: string;
    branchId?: string | null;
    asOf: string;
  },
): Promise<IpdOccupancySummary> {
  const asOf = new Date(input.asOf);
  const scope = { hospitalId: input.hospitalId, ...branchFilter(input.branchId) };

  const beds = await prisma.ipdBed.findMany({
    where: scope,
    select: { id: true, status: true },
  });

  const activeAssignments = await prisma.ipdBedAssignment.findMany({
    where: {
      hospitalId: input.hospitalId,
      assignedAt: { lt: asOf },
      OR: [{ releasedAt: null }, { releasedAt: { gte: asOf } }],
      bed: branchFilter(input.branchId).branchId
        ? { branchId: input.branchId! }
        : { hospitalId: input.hospitalId },
    },
    select: { bedId: true },
  });

  const occupiedBedIds = new Set(activeAssignments.map((a) => a.bedId));

  let maintenanceBeds = 0;
  let inactiveBeds = 0;
  let availableBeds = 0;
  for (const bed of beds) {
    if (bed.status === BedStatus.INACTIVE) {
      inactiveBeds += 1;
      continue;
    }
    if (bed.status === BedStatus.MAINTENANCE) {
      maintenanceBeds += 1;
      continue;
    }
    if (occupiedBedIds.has(bed.id)) {
      continue;
    }
    if (bed.status === BedStatus.AVAILABLE) {
      availableBeds += 1;
    }
  }

  const occupiedBeds = occupiedBedIds.size;
  const totalBeds = beds.length - inactiveBeds;
  const occupancyRate =
    totalBeds > 0
      ? `${((occupiedBeds / totalBeds) * 100).toFixed(2)}`
      : null;

  const activeAdmissions = await prisma.ipdAdmission.count({
    where: {
      ...scope,
      status: IpdAdmissionStatus.ADMITTED,
      admissionDate: { lt: asOf },
      OR: [{ dischargeDate: null }, { dischargeDate: { gte: asOf } }],
    },
  });

  return {
    asOf: input.asOf,
    branchId: input.branchId ?? null,
    timeBasis:
      'point-in-time using IpdBedAssignment.assignedAt/releasedAt and IpdAdmission dates',
    totalBeds,
    occupiedBeds,
    availableBeds,
    maintenanceBeds,
    inactiveBeds,
    occupancyRate,
    activeAdmissions,
  };
}
