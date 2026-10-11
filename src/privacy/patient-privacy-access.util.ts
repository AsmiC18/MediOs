import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Patient } from '@prisma/client';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';

export type PatientPrivacyActor = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
  /** When null, audit and staff FK fields are omitted (patient portal actor). */
  auditUserId?: string | null;
};

export function resolvePrivacyAuditUserId(
  user: PatientPrivacyActor,
): string | undefined {
  if (user.auditUserId === null) {
    return undefined;
  }
  if (user.auditUserId !== undefined) {
    return user.auditUserId;
  }
  return user.sub;
}

export function resolvePrivacyRecordedByUserId(
  user: PatientPrivacyActor,
): string | null {
  if (user.auditUserId === null) {
    return null;
  }
  return user.sub;
}

export async function findOwnedPatientForPrivacy(
  prisma: PrismaService,
  user: PatientPrivacyActor,
  patientId: string,
): Promise<Patient> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient || patient.hospitalId !== user.hospitalId) {
    throw new NotFoundException('Patient not found');
  }

  assertBranchAccess(user, patient.branchId);

  return patient;
}

export function assertPatientNotAnonymized(patient: Patient): void {
  if (patient.anonymizedAt) {
    throw new ForbiddenException('Patient record has been anonymized');
  }
}
