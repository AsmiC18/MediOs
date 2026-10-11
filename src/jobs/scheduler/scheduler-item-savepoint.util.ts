import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';

const ITEM_SAVEPOINT_PATTERN = /^scheduler_item_[a-f0-9]{16}$/;

export function schedulerItemSavepointName(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 16);
  return `scheduler_item_${hash}`;
}

export async function schedulerItemSavepoint(
  transaction: Prisma.TransactionClient,
  action: 'SAVEPOINT' | 'RELEASE SAVEPOINT' | 'ROLLBACK TO SAVEPOINT',
  name: string,
): Promise<void> {
  if (!ITEM_SAVEPOINT_PATTERN.test(name)) {
    throw new Error(`Invalid scheduler item savepoint name: ${name}`);
  }
  await transaction.$executeRaw(Prisma.raw(`${action} "${name}"`));
}
