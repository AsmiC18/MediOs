export function buildAnonymizedPatientPhone(patientId: string): string {
  const suffix = patientId.replace(/-/g, '').slice(0, 12);
  return `DELETED-PATIENT-${suffix}`;
}

export const ANONYMIZED_FIRST_NAME = 'Deleted';
export const ANONYMIZED_LAST_NAME = 'Patient';
