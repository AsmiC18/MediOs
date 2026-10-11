import { Prisma } from '@prisma/client';

export type PortalPrescriptionItemResponse = {
  id: string;
  medicationName: string;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  quantity: number | null;
  clinicalDrug: {
    genericName: string;
    brandName: string | null;
    strength: string | null;
    dosageForm: string | null;
  } | null;
};

export type PortalPrescriptionResponse = {
  id: string;
  encounterId: string;
  status: string;
  notes: string | null;
  createdAt: string;
  encounterStartedAt: string | null;
  items: PortalPrescriptionItemResponse[];
};

export function mapPortalPrescriptionItem(
  item: Prisma.PrescriptionItemGetPayload<{
    include: { clinicalDrug: true };
  }>,
): PortalPrescriptionItemResponse {
  return {
    id: item.id,
    medicationName: item.medicationName,
    dosage: item.dosage,
    route: item.route,
    frequency: item.frequency,
    duration: item.duration,
    instructions: item.instructions,
    quantity: item.quantity,
    clinicalDrug: item.clinicalDrug
      ? {
          genericName: item.clinicalDrug.genericName,
          brandName: item.clinicalDrug.brandName,
          strength: item.clinicalDrug.strength,
          dosageForm: item.clinicalDrug.dosageForm,
        }
      : null,
  };
}

export function mapPortalPrescriptionSummary(
  prescription: Prisma.PrescriptionGetPayload<{ include: { items: true } }>,
): Pick<PortalPrescriptionResponse, 'id' | 'encounterId' | 'status' | 'notes' | 'createdAt' | 'items'> {
  return {
    id: prescription.id,
    encounterId: prescription.encounterId,
    status: prescription.status,
    notes: prescription.notes,
    createdAt: prescription.createdAt.toISOString(),
    items: prescription.items.map((item) => ({
      id: item.id,
      medicationName: item.medicationName,
      dosage: item.dosage,
      route: item.route,
      frequency: item.frequency,
      duration: item.duration,
      instructions: item.instructions,
      quantity: item.quantity,
      clinicalDrug: null,
    })),
  };
}

type PortalClinicalEncounterInput = Prisma.ClinicalEncounterGetPayload<{
  include: {
    provider: { select: { id: true; name: true; email: true } };
    appointment: { select: { id: true; startAt: true; endAt: true; status: true } };
    ipdAdmission: { select: { id: true; admissionNumber: true; status: true } };
    soapNote: true;
    diagnoses: true;
    prescriptions: { include: { items: true } };
  };
}>;

export function mapPortalClinicalRecords(raw: {
  patientId: string;
  encounters: PortalClinicalEncounterInput[];
}) {
  return {
    patientId: raw.patientId,
    encounters: raw.encounters.map((encounter) => ({
      id: encounter.id,
      branchId: encounter.branchId,
      encounterType: encounter.encounterType,
      status: encounter.status,
      startedAt: encounter.startedAt.toISOString(),
      endedAt: encounter.endedAt?.toISOString() ?? null,
      provider: encounter.provider ? { name: encounter.provider.name } : null,
      appointment: encounter.appointment
        ? {
            id: encounter.appointment.id,
            startAt: encounter.appointment.startAt.toISOString(),
            endAt: encounter.appointment.endAt.toISOString(),
            status: encounter.appointment.status,
          }
        : null,
      ipdAdmission: encounter.ipdAdmission
        ? {
            admissionNumber: encounter.ipdAdmission.admissionNumber,
            status: encounter.ipdAdmission.status,
          }
        : null,
      soapNote: encounter.soapNote
        ? {
            subjective: encounter.soapNote.subjective,
            objective: encounter.soapNote.objective,
            assessment: encounter.soapNote.assessment,
            plan: encounter.soapNote.plan,
          }
        : null,
      diagnoses: encounter.diagnoses.map((d) => ({
        id: d.id,
        code: d.code,
        description: d.description,
        diagnosisType: d.diagnosisType,
        createdAt: d.createdAt.toISOString(),
      })),
      prescriptions: encounter.prescriptions.map(mapPortalPrescriptionSummary),
    })),
  };
}

export function mapPortalPrescriptionsList(
  rows: Prisma.PrescriptionGetPayload<{
    include: {
      items: { include: { clinicalDrug: true } };
      encounter: { select: { startedAt: true } };
    };
  }>[],
): { items: PortalPrescriptionResponse[] } {
  return {
    items: rows.map((row) => ({
      id: row.id,
      encounterId: row.encounterId,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      encounterStartedAt: row.encounter.startedAt.toISOString(),
      items: row.items.map(mapPortalPrescriptionItem),
    })),
  };
}

export function mapPortalDiagnostics(raw: {
  patientId: string;
  orders: Array<{
    id: string;
    orderNumber: string;
    orderedAt: Date;
    status: string;
    priority: string;
    encounterId: string;
    branchId: string | null;
    tests: Array<{
      id: string;
      testCode: string;
      testName: string;
      status: string;
      resultValue: string | null;
      resultFlag: string | null;
      verifiedAt: Date | null;
    }>;
  }>;
}) {
  return {
    patientId: raw.patientId,
    orders: raw.orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      orderedAt: order.orderedAt.toISOString(),
      status: order.status,
      priority: order.priority,
      encounterId: order.encounterId,
      branchId: order.branchId,
      tests: order.tests.map((test) => ({
        id: test.id,
        testCode: test.testCode,
        testName: test.testName,
        status: test.status,
        resultValue: test.resultValue,
        resultFlag: test.resultFlag,
        verifiedAt: test.verifiedAt?.toISOString() ?? null,
      })),
    })),
  };
}
