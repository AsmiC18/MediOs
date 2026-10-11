import {
  PharmacyPrescriptionWorkItemStatus,
  PrescriptionStatus,
  Prisma,
} from '@prisma/client';

export type PrescriptionWorkItemSummaryResponse = {
  id: string;
  prescriptionId: string;
  patientId: string;
  encounterId: string;
  branchId: string | null;
  workItemStatus: PharmacyPrescriptionWorkItemStatus;
  prescriptionStatus: PrescriptionStatus;
  fulfilledDispensingId: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrescriptionWorkItemDetailResponse =
  PrescriptionWorkItemSummaryResponse & {
    prescription: {
      id: string;
      status: PrescriptionStatus;
      createdAt: string;
      items: Array<{
        id: string;
        medicationName: string;
        dosage: string | null;
        route: string | null;
        frequency: string | null;
        duration: string | null;
        quantity: number | null;
        instructions: string | null;
      }>;
    };
  };

export type PrescriptionWorkItemListResponse = {
  data: PrescriptionWorkItemSummaryResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

const prescriptionSummarySelect = {
  id: true,
  status: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      medicationName: true,
      dosage: true,
      route: true,
      frequency: true,
      duration: true,
      quantity: true,
      instructions: true,
    },
  },
} satisfies Prisma.PrescriptionSelect;

export type WorkItemWithPrescription = Prisma.PharmacyPrescriptionWorkItemGetPayload<{
  include: { prescription: { select: typeof prescriptionSummarySelect } };
}>;

export function mapPrescriptionWorkItemSummary(
  row: WorkItemWithPrescription,
): PrescriptionWorkItemSummaryResponse {
  return {
    id: row.id,
    prescriptionId: row.prescriptionId,
    patientId: row.patientId,
    encounterId: row.encounterId,
    branchId: row.branchId,
    workItemStatus: row.status,
    prescriptionStatus: row.prescription.status,
    fulfilledDispensingId: row.fulfilledDispensingId,
    processedAt: row.processedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapPrescriptionWorkItemDetail(
  row: WorkItemWithPrescription,
): PrescriptionWorkItemDetailResponse {
  const summary = mapPrescriptionWorkItemSummary(row);
  return {
    ...summary,
    prescription: {
      id: row.prescription.id,
      status: row.prescription.status,
      createdAt: row.prescription.createdAt.toISOString(),
      items: row.prescription.items.map((item) => ({
        id: item.id,
        medicationName: item.medicationName,
        dosage: item.dosage,
        route: item.route,
        frequency: item.frequency,
        duration: item.duration,
        quantity: item.quantity,
        instructions: item.instructions,
      })),
    },
  };
}

export const prescriptionWorkItemInclude = {
  prescription: { select: prescriptionSummarySelect },
} satisfies Prisma.PharmacyPrescriptionWorkItemInclude;
