import { Prisma } from '@prisma/client';

/** Serializes active-leave overlap checks for one provider within a hospital. */
export async function acquireProviderLeaveAdvisoryLock(
  tx: Prisma.TransactionClient,
  hospitalId: string,
  userId: string,
): Promise<void> {
  const lockKey = `provider-leave:${hospitalId}:${userId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}
