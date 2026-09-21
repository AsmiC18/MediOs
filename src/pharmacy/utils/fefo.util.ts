import { BadRequestException } from '@nestjs/common';
import { PharmacyBatch, Prisma } from '@prisma/client';

export type BatchAllocation = {
  batchId: string;
  quantity: number;
  unitPrice: number;
};

export function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function assertBatchNotExpired(batch: PharmacyBatch, asOf: Date = new Date()): void {
  const today = startOfUtcDay(asOf);
  const expiryDay = startOfUtcDay(batch.expiryDate);

  if (expiryDay < today) {
    throw new BadRequestException(`Batch ${batch.batchNumber} is expired`);
  }
}

export function allocateFefoBatches(
  batches: PharmacyBatch[],
  quantityNeeded: number,
  asOf: Date = new Date(),
): BatchAllocation[] {
  const today = startOfUtcDay(asOf);
  const eligible = batches
    .filter((batch) => batch.quantity > 0 && startOfUtcDay(batch.expiryDate) >= today)
    .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

  let remaining = quantityNeeded;
  const allocations: BatchAllocation[] = [];

  for (const batch of eligible) {
    if (remaining <= 0) {
      break;
    }

    const take = Math.min(batch.quantity, remaining);
    if (take <= 0) {
      continue;
    }

    allocations.push({
      batchId: batch.id,
      quantity: take,
      unitPrice: batch.sellingPrice ? Number(batch.sellingPrice) : 0,
    });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new BadRequestException('Insufficient stock across eligible batches');
  }

  return allocations;
}

export async function findEligibleBatches(
  tx: Prisma.TransactionClient,
  input: {
    hospitalId: string;
    productId: string;
    branchId?: string | null;
  },
): Promise<PharmacyBatch[]> {
  const where: Prisma.PharmacyBatchWhereInput = {
    hospitalId: input.hospitalId,
    productId: input.productId,
    quantity: { gt: 0 },
    product: { isActive: true },
  };

  if (input.branchId) {
    where.OR = [{ branchId: input.branchId }, { branchId: null }];
  }

  return tx.pharmacyBatch.findMany({
    where,
    orderBy: { expiryDate: 'asc' },
  });
}
