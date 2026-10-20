import { Job, JobStatus, Prisma } from '@prisma/client';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { SchedulerExecutionContext } from '../jobs/scheduler/scheduler.types';
import {
  billingPaymentReconcileIdempotencyKey,
  billingRefundReconcileIdempotencyKey,
} from './reconciliation-job.types';

/** Cooldown after generation G completes/deads before enqueueing G+1 (scheduler-only). */
export function cooldownMsAfterGeneration(generation: number): number {
  if (generation <= 1) {
    return 15 * 60 * 1000;
  }
  if (generation === 2) {
    return 30 * 60 * 1000;
  }
  if (generation === 3) {
    return 60 * 60 * 1000;
  }
  return 4 * 60 * 60 * 1000;
}

export type ReconciliationJobHistoryItem = {
  generation: number;
  status: JobStatus;
  completedAt: Date | null;
  failedAt: Date | null;
  updatedAt: Date;
};

export function paymentReconcileJobKeyPrefix(paymentId: string): string {
  return `${JOB_TYPES.BILLING_PAYMENT_RECONCILE}:${paymentId}`;
}

export function refundReconcileJobKeyPrefix(refundId: string): string {
  return `${JOB_TYPES.BILLING_REFUND_RECONCILE}:${refundId}`;
}

/** Parses generation from idempotency key; legacy key without suffix is generation 1. */
export function parsePaymentReconcileGeneration(
  idempotencyKey: string,
  paymentId: string,
): number | null {
  return parseGenerationFromKey(
    idempotencyKey,
    paymentReconcileJobKeyPrefix(paymentId),
  );
}

export function parseRefundReconcileGeneration(
  idempotencyKey: string,
  refundId: string,
): number | null {
  return parseGenerationFromKey(
    idempotencyKey,
    refundReconcileJobKeyPrefix(refundId),
  );
}

function parseGenerationFromKey(
  idempotencyKey: string,
  basePrefix: string,
): number | null {
  if (idempotencyKey === basePrefix) {
    return 1;
  }
  if (!idempotencyKey.startsWith(`${basePrefix}:`)) {
    return null;
  }
  const suffix = idempotencyKey.slice(basePrefix.length + 1);
  if (!/^\d+$/.test(suffix)) {
    return null;
  }
  const generation = Number.parseInt(suffix, 10);
  return generation >= 1 ? generation : null;
}

export function jobTerminalAt(job: ReconciliationJobHistoryItem): Date {
  if (job.status === JobStatus.COMPLETED && job.completedAt) {
    return job.completedAt;
  }
  if (job.status === JobStatus.DEAD) {
    return job.failedAt ?? job.updatedAt;
  }
  return job.updatedAt;
}

/**
 * Returns the next generation to enqueue, or null when in-flight or cooldown blocks.
 * Uses the highest generation present in history as the latest reconciliation attempt.
 */
export function decideNextReconciliationGeneration(
  history: ReconciliationJobHistoryItem[],
  tickAt: Date,
): number | null {
  if (history.length === 0) {
    return 1;
  }

  let maxGen = 0;
  let latest: ReconciliationJobHistoryItem | null = null;
  for (const item of history) {
    if (item.generation > maxGen) {
      maxGen = item.generation;
      latest = item;
    }
  }

  if (!latest) {
    return 1;
  }

  if (
    latest.status === JobStatus.PENDING ||
    latest.status === JobStatus.RUNNING
  ) {
    return null;
  }

  if (
    latest.status === JobStatus.COMPLETED ||
    latest.status === JobStatus.DEAD
  ) {
    const terminalAt = jobTerminalAt(latest);
    const cooldownMs = cooldownMsAfterGeneration(maxGen);
    if (tickAt.getTime() - terminalAt.getTime() < cooldownMs) {
      return null;
    }
    return maxGen + 1;
  }

  return null;
}

function jobToHistoryItem(
  job: Job,
  parseGeneration: (key: string) => number | null,
): ReconciliationJobHistoryItem | null {
  const generation = parseGeneration(job.idempotencyKey);
  if (generation === null) {
    return null;
  }
  return {
    generation,
    status: job.status,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    updatedAt: job.updatedAt,
  };
}

/** Entity id segment from `jobType:entityId` or `jobType:entityId:generation` keys. */
export function parseReconcileEntityIdFromJobKey(
  idempotencyKey: string,
  jobType: string,
): string | null {
  const head = `${jobType}:`;
  if (!idempotencyKey.startsWith(head)) {
    return null;
  }
  const rest = idempotencyKey.slice(head.length);
  if (rest.length === 0) {
    return null;
  }
  const lastColon = rest.lastIndexOf(':');
  if (lastColon === -1) {
    return rest;
  }
  const suffix = rest.slice(lastColon + 1);
  if (/^\d+$/.test(suffix)) {
    return rest.slice(0, lastColon);
  }
  return rest;
}

function emptyHistoryMap(ids: readonly string[]): Map<string, ReconciliationJobHistoryItem[]> {
  const map = new Map<string, ReconciliationJobHistoryItem[]>();
  for (const id of ids) {
    map.set(id, []);
  }
  return map;
}

function groupReconcileJobHistory(
  jobs: Job[],
  jobType: string,
  targetIds: Set<string>,
  parseGenerationForEntity: (key: string, entityId: string) => number | null,
): Map<string, ReconciliationJobHistoryItem[]> {
  const map = emptyHistoryMap([...targetIds]);
  for (const job of jobs) {
    const entityId = parseReconcileEntityIdFromJobKey(job.idempotencyKey, jobType);
    if (!entityId || !targetIds.has(entityId)) {
      continue;
    }
    const parse = (key: string) => parseGenerationForEntity(key, entityId);
    const item = jobToHistoryItem(job, parse);
    if (item) {
      map.get(entityId)!.push(item);
    }
  }
  return map;
}

/** One query per hospital for payment reconcile history (replaces per-payment N+1). */
export async function loadPaymentReconcileJobHistoriesByPaymentId(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  paymentIds: readonly string[],
): Promise<Map<string, ReconciliationJobHistoryItem[]>> {
  const uniqueIds = [...new Set(paymentIds)];
  const map = emptyHistoryMap(uniqueIds);
  if (uniqueIds.length === 0) {
    return map;
  }

  const jobs = await transaction.job.findMany({
    where: {
      hospitalId,
      type: JOB_TYPES.BILLING_PAYMENT_RECONCILE,
      idempotencyKey: {
        startsWith: `${JOB_TYPES.BILLING_PAYMENT_RECONCILE}:`,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return groupReconcileJobHistory(
    jobs,
    JOB_TYPES.BILLING_PAYMENT_RECONCILE,
    new Set(uniqueIds),
    parsePaymentReconcileGeneration,
  );
}

/** One query per hospital for refund reconcile history (replaces per-refund N+1). */
export async function loadRefundReconcileJobHistoriesByRefundId(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  refundIds: readonly string[],
): Promise<Map<string, ReconciliationJobHistoryItem[]>> {
  const uniqueIds = [...new Set(refundIds)];
  const map = emptyHistoryMap(uniqueIds);
  if (uniqueIds.length === 0) {
    return map;
  }

  const jobs = await transaction.job.findMany({
    where: {
      hospitalId,
      type: JOB_TYPES.BILLING_REFUND_RECONCILE,
      idempotencyKey: {
        startsWith: `${JOB_TYPES.BILLING_REFUND_RECONCILE}:`,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return groupReconcileJobHistory(
    jobs,
    JOB_TYPES.BILLING_REFUND_RECONCILE,
    new Set(uniqueIds),
    parseRefundReconcileGeneration,
  );
}

export async function loadPaymentReconcileJobHistory(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  paymentId: string,
): Promise<ReconciliationJobHistoryItem[]> {
  const map = await loadPaymentReconcileJobHistoriesByPaymentId(
    transaction,
    hospitalId,
    [paymentId],
  );
  return map.get(paymentId) ?? [];
}

export async function loadRefundReconcileJobHistory(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  refundId: string,
): Promise<ReconciliationJobHistoryItem[]> {
  const map = await loadRefundReconcileJobHistoriesByRefundId(
    transaction,
    hospitalId,
    [refundId],
  );
  return map.get(refundId) ?? [];
}

export async function tryEnqueuePaymentReconcileIfEligible(
  context: SchedulerExecutionContext,
  hospitalId: string,
  paymentId: string,
  preloadedHistory?: ReconciliationJobHistoryItem[],
): Promise<boolean> {
  const history =
    preloadedHistory ??
    (await loadPaymentReconcileJobHistory(
      context.transaction,
      hospitalId,
      paymentId,
    ));
  const nextGeneration = decideNextReconciliationGeneration(
    history,
    context.tickAt,
  );
  if (nextGeneration === null) {
    return false;
  }

  await context.jobService.enqueueWithClient(context.transaction, {
    hospitalId,
    branchId: null,
    type: JOB_TYPES.BILLING_PAYMENT_RECONCILE,
    idempotencyKey: billingPaymentReconcileIdempotencyKey(
      paymentId,
      nextGeneration,
    ),
    payload: { paymentId },
    maxAttempts: 5,
  });
  return true;
}

export async function tryEnqueueRefundReconcileIfEligible(
  context: SchedulerExecutionContext,
  hospitalId: string,
  refundId: string,
  preloadedHistory?: ReconciliationJobHistoryItem[],
): Promise<boolean> {
  const history =
    preloadedHistory ??
    (await loadRefundReconcileJobHistory(
      context.transaction,
      hospitalId,
      refundId,
    ));
  const nextGeneration = decideNextReconciliationGeneration(
    history,
    context.tickAt,
  );
  if (nextGeneration === null) {
    return false;
  }

  await context.jobService.enqueueWithClient(context.transaction, {
    hospitalId,
    branchId: null,
    type: JOB_TYPES.BILLING_REFUND_RECONCILE,
    idempotencyKey: billingRefundReconcileIdempotencyKey(
      refundId,
      nextGeneration,
    ),
    payload: { refundId },
    maxAttempts: 5,
  });
  return true;
}
