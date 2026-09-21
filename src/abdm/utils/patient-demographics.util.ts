import { Gender, Patient } from '@prisma/client';

export type PatientDemographics = {
  name: string;
  gender: 'M' | 'F' | 'O';
  yearOfBirth: number;
};

export function mapPatientGender(gender: Gender | null | undefined): 'M' | 'F' | 'O' {
  switch (gender) {
    case Gender.MALE:
      return 'M';
    case Gender.FEMALE:
      return 'F';
    default:
      return 'O';
  }
}

export function buildPatientDemographics(patient: Patient): PatientDemographics {
  if (!patient.dateOfBirth) {
    throw new Error('Patient dateOfBirth is required for demographic ABHA verification');
  }

  const yearOfBirth = patient.dateOfBirth.getUTCFullYear();
  const nameParts = [patient.firstName, patient.lastName].filter(Boolean);
  const name = nameParts.join(' | ');

  if (!name.trim()) {
    throw new Error('Patient name is required for demographic ABHA verification');
  }

  return {
    name,
    gender: mapPatientGender(patient.gender),
    yearOfBirth,
  };
}
