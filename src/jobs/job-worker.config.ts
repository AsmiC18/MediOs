export type JobWorkerConfig = {
  batchSize: number;
  pollIntervalMs: number;
  staleLeaseMs: number;
};

function readPositiveInt(
  envValue: string | undefined,
  fallback: number,
): number {
  if (envValue === undefined || envValue.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(envValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function loadJobWorkerConfig(): JobWorkerConfig {
  const batchSize = readPositiveInt(process.env.JOB_WORKER_BATCH_SIZE, 5);
  const pollIntervalMs = readPositiveInt(
    process.env.JOB_WORKER_POLL_INTERVAL_MS,
    2000,
  );
  const staleLeaseMs = readPositiveInt(
    process.env.JOB_WORKER_STALE_LEASE_MS,
    5 * 60 * 1000,
  );

  return {
    batchSize,
    pollIntervalMs,
    staleLeaseMs,
  };
}
