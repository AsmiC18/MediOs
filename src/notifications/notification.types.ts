import { Prisma } from '@prisma/client';

export type CreateNotificationInput = {
  hospitalId: string;
  branchId?: string | null;
  patientId?: string | null;
  outboxId?: string | null;
  category: string;
  channel: string;
  templateKey?: string | null;
  payload: Prisma.InputJsonValue;
  idempotencyKey: string;
};
