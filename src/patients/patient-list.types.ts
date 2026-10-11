import { Prisma } from '@prisma/client';

/** Fields returned by GET /patients (list/search). */
export const PATIENT_LIST_SELECT = {
  id: true,
  hospitalId: true,
  branchId: true,
  phone: true,
  firstName: true,
  lastName: true,
  email: true,
  dateOfBirth: true,
  gender: true,
  mergedIntoPatientId: true,
  mergedAt: true,
  isAtRisk: true,
  atRiskStatus: true,
  suggestedAction: true,
  atRiskEvaluatedAt: true,
  daysSinceLastVisit: true,
  averageVisitCadenceDays: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PatientSelect;

export type PatientListItem = Prisma.PatientGetPayload<{
  select: typeof PATIENT_LIST_SELECT;
}>;

export type PatientListResponse = {
  data: PatientListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
