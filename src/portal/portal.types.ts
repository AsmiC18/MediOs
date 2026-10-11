export const PATIENT_PRINCIPAL_TYPE = 'PATIENT' as const;
export const STAFF_PRINCIPAL_TYPE = 'STAFF' as const;

export type PatientPrincipal = {
  principalType: typeof PATIENT_PRINCIPAL_TYPE;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
};

export type StaffJwtPayload = {
  principalType?: typeof STAFF_PRINCIPAL_TYPE;
  sub: string;
  hospitalId: string;
  branchId?: string | null;
  roleId: string;
  role: string;
};

export type PatientJwtPayload = {
  principalType: typeof PATIENT_PRINCIPAL_TYPE;
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};
