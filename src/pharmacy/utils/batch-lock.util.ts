import { ConflictException } from '@nestjs/common';
import { PharmacyBatch, Prisma } from '@prisma/client';

export async function lockBatchRow(
  tx: Prisma.TransactionClient,
  batchId: string,
): Promise<PharmacyBatch> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pharmacy-batch:' + batchId}))`;

  const batch = await tx.pharmacyBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new ConflictException('Batch not found');
  }

  return batch;
}

export async function lockBatchesInOrder(
  tx: Prisma.TransactionClient,
  batchIds: string[],
): Promise<PharmacyBatch[]> {
  const uniqueSorted = [...new Set(batchIds)].sort();
  const batches: PharmacyBatch[] = [];

  for (const batchId of uniqueSorted) {
    batches.push(await lockBatchRow(tx, batchId));
  }

  return batches;
}
