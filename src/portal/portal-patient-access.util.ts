import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Patient, PatientPortalAccountStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export async function loadActivePortalPatient(
  prisma: PrismaService,
  patientId: string,
  hospitalId: string,
): Promise<Patient> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, hospitalId },
  });

  if (!patient) {
    throw new NotFoundException('Not found');
  }

  assertPatientEligibleForPortal(patient);
  return patient;
}

export function assertPatientEligibleForPortal(patient: Patient): void {
  if (patient.anonymizedAt) {
    throw new ForbiddenException('Invalid credentials');
  }
  if (patient.mergedIntoPatientId) {
    throw new ForbiddenException('Invalid credentials');
  }
}

export function assertPortalAccountActive(status: PatientPortalAccountStatus): void {
  if (status !== PatientPortalAccountStatus.ACTIVE) {
    throw new ForbiddenException('Invalid credentials');
  }
}
