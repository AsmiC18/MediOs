import { Prisma } from '@prisma/client';

export async function schedulerSavepoint(
  transaction: Prisma.TransactionClient,
  action: 'SAVEPOINT' | 'RELEASE SAVEPOINT' | 'ROLLBACK TO SAVEPOINT',
  name: string,
): Promise<void> {
  if (!/^scheduler_task_\d+$/.test(name)) {
    throw new Error(`Invalid scheduler savepoint name: ${name}`);
  }
  await transaction.$executeRaw(Prisma.raw(`${action} "${name}"`));
}
