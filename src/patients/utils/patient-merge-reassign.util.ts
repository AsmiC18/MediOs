import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type PatientMergeReassignResult = {
  counts: Record<string, number>;
  totalRecordsMoved: number;
};

type MergeTx = Prisma.TransactionClient;

const REASSIGN_MODELS: Array<{
  key: string;
  updateMany: (tx: MergeTx, hospitalId: string, sourceId: string, targetId: string) => Promise<{ count: number }>;
}> = [
  {
    key: 'appointment',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.appointment.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'clinicalEncounter',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.clinicalEncounter.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'prescription',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.prescription.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'diagnosticOrder',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.diagnosticOrder.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'invoice',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.invoice.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'insuranceClaim',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.insuranceClaim.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'patientInsurancePolicy',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.patientInsurancePolicy.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'insurancePreAuthorization',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.insurancePreAuthorization.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'opdQueueEntry',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.opdQueueEntry.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'ipdAdmission',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.ipdAdmission.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'emergencyVisit',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.emergencyVisit.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'clinicalAttachment',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.clinicalAttachment.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'pharmacyDispensing',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.pharmacyDispensing.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'pharmacyPrescriptionWorkItem',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.pharmacyPrescriptionWorkItem.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'surgeryRequest',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.surgeryRequest.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'patientFieldHistory',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.patientFieldHistory.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'abdmConsent',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.abdmConsent.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'notification',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.notification.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
  {
    key: 'whatsAppMessage',
    updateMany: (tx, hospitalId, sourceId, targetId) =>
      tx.whatsAppMessage.updateMany({
        where: { hospitalId, patientId: sourceId },
        data: { patientId: targetId },
      }),
  },
];

export async function assertPatientMergePreconditions(
  tx: MergeTx,
  hospitalId: string,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const [sourceAbha, targetAbha, sourceWa, targetWa, targetPref, sourcePref] =
    await Promise.all([
      tx.patientAbhaLink.findUnique({ where: { patientId: sourceId } }),
      tx.patientAbhaLink.findUnique({ where: { patientId: targetId } }),
      tx.whatsAppConversation.findFirst({
        where: { hospitalId, patientId: sourceId },
      }),
      tx.whatsAppConversation.findFirst({
        where: { hospitalId, patientId: targetId },
      }),
      tx.patientNotificationPreference.findUnique({
        where: {
          hospitalId_patientId: { hospitalId, patientId: targetId },
        },
      }),
      tx.patientNotificationPreference.findUnique({
        where: {
          hospitalId_patientId: { hospitalId, patientId: sourceId },
        },
      }),
    ]);

  if (sourceAbha && targetAbha) {
    throw new ConflictException(
      'Cannot merge patients when both have ABHA links',
    );
  }

  if (sourceWa && targetWa) {
    throw new ConflictException(
      'Cannot merge patients when both have WhatsApp conversations',
    );
  }

  if (sourcePref && targetPref) {
    await tx.patientNotificationPreference.delete({
      where: { id: sourcePref.id },
    });
  } else if (sourcePref && !targetPref) {
    await tx.patientNotificationPreference.update({
      where: { id: sourcePref.id },
      data: { patientId: targetId },
    });
  }

  if (sourceAbha && !targetAbha) {
    await tx.patientAbhaLink.update({
      where: { patientId: sourceId },
      data: { patientId: targetId },
    });
  }

  if (sourceWa && !targetWa) {
    await tx.whatsAppConversation.update({
      where: { id: sourceWa.id },
      data: { patientId: targetId },
    });
  }
}

export async function reassignPatientOwnedRecords(
  tx: MergeTx,
  hospitalId: string,
  sourceId: string,
  targetId: string,
): Promise<PatientMergeReassignResult> {
  const counts: Record<string, number> = {};
  let totalRecordsMoved = 0;

  for (const entry of REASSIGN_MODELS) {
    const result = await entry.updateMany(tx, hospitalId, sourceId, targetId);
    counts[entry.key] = result.count;
    totalRecordsMoved += result.count;
  }

  return { counts, totalRecordsMoved };
}
