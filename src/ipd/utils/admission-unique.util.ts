import { Prisma } from '@prisma/client';

/** Partial unique index from migration 20261006150000_ipd_one_active_admission_per_patient */
export const IPD_ACTIVE_ADMISSION_UNIQUE_INDEX =
  'IpdAdmission_one_active_per_patient_hospital';

export function isActiveAdmissionUniqueViolation(
  error: unknown,
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const target = error.meta?.target;

  if (typeof target === 'string') {
    return target.includes(IPD_ACTIVE_ADMISSION_UNIQUE_INDEX);
  }

  if (Array.isArray(target)) {
    if (target.some((entry) => String(entry).includes(IPD_ACTIVE_ADMISSION_UNIQUE_INDEX))) {
      return true;
    }
    return (
      target.includes('hospitalId') &&
      target.includes('patientId') &&
      target.length === 2
    );
  }

  return false;
}
