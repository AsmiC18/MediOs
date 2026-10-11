import { Prisma } from '@prisma/client';

export type EnqueueJobInput = {
  hospitalId: string;
  branchId?: string | null;
  type: string;
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
  maxAttempts: number;
  availableAt?: Date;
};
