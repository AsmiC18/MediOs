import { BedStatus, Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { IpdBed } from '@prisma/client';

export async function lockBedRow(
  tx: Prisma.TransactionClient,
  bedId: string,
): Promise<IpdBed> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ipd-bed:' + bedId}))`;

  const bed = await tx.ipdBed.findUnique({
    where: { id: bedId },
  });

  if (!bed) {
    throw new ConflictException('Bed not found');
  }

  return bed;
}

export async function lockBedsInOrder(
  tx: Prisma.TransactionClient,
  bedIds: string[],
): Promise<IpdBed[]> {
  const uniqueSorted = [...new Set(bedIds)].sort();
  const beds: IpdBed[] = [];

  for (const bedId of uniqueSorted) {
    beds.push(await lockBedRow(tx, bedId));
  }

  return beds;
}

export function assertBedAvailableForAllocation(bed: IpdBed): void {
  if (bed.status === BedStatus.INACTIVE) {
    throw new ConflictException('Bed is inactive and cannot be allocated');
  }

  if (bed.status === BedStatus.MAINTENANCE) {
    throw new ConflictException('Bed is under maintenance and cannot be allocated');
  }

  if (bed.status !== BedStatus.AVAILABLE) {
    throw new ConflictException('Bed is not available');
  }
}

export async function occupyBed(
  tx: Prisma.TransactionClient,
  bedId: string,
): Promise<IpdBed> {
  const bed = await lockBedRow(tx, bedId);
  assertBedAvailableForAllocation(bed);

  return tx.ipdBed.update({
    where: { id: bedId },
    data: { status: BedStatus.OCCUPIED },
  });
}

export async function releaseBed(
  tx: Prisma.TransactionClient,
  bedId: string,
): Promise<IpdBed> {
  await lockBedRow(tx, bedId);

  return tx.ipdBed.update({
    where: { id: bedId },
    data: { status: BedStatus.AVAILABLE },
  });
}
