import {
  Patient,
  PatientPrivacyConsentStatus,
  PatientPrivacyPurpose,
  Prisma,
  PrismaClient,
} from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export async function isPatientEligibleForTransactionalCommunication(
  db: Db,
  input: { hospitalId: string; patientId: string },
): Promise<boolean> {
  const patient = await db.patient.findFirst({
    where: { id: input.patientId, hospitalId: input.hospitalId },
    select: {
      id: true,
      anonymizedAt: true,
      mergedIntoPatientId: true,
    },
  });

  if (!patient || patient.anonymizedAt || patient.mergedIntoPatientId) {
    return false;
  }

  const communicationConsent = await db.patientPrivacyConsent.findFirst({
    where: {
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      purpose: PatientPrivacyPurpose.COMMUNICATION,
      status: PatientPrivacyConsentStatus.GRANTED,
    },
    orderBy: [{ grantedAt: 'desc' }, { createdAt: 'desc' }],
  });

  if (!communicationConsent) {
    return false;
  }

  const withdrawnAfter = await db.patientPrivacyConsent.findFirst({
    where: {
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      purpose: PatientPrivacyPurpose.COMMUNICATION,
      status: PatientPrivacyConsentStatus.WITHDRAWN,
      createdAt: { gt: communicationConsent.createdAt },
    },
  });

  return !withdrawnAfter;
}

export function assertPatientEngagementTarget(patient: Patient): void {
  if (patient.hospitalId === undefined) {
    return;
  }
  if (patient.anonymizedAt) {
    throw new Error('Patient is anonymized');
  }
  if (patient.mergedIntoPatientId) {
    throw new Error('Patient has been merged');
  }
}
