import { NotFoundException } from '@nestjs/common';
import { PharmacyPrescriptionWorkItem, Prisma } from '@prisma/client';

export async function lockPrescriptionWorkItemRow(
  tx: Prisma.TransactionClient,
  workItemId: string,
): Promise<PharmacyPrescriptionWorkItem> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pharmacy-rx-work-item:' + workItemId}))`;

  const workItem = await tx.pharmacyPrescriptionWorkItem.findUnique({
    where: { id: workItemId },
  });

  if (!workItem) {
    throw new NotFoundException('Prescription work item not found');
  }

  return workItem;
}
