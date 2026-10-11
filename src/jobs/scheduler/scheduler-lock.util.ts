/** Deterministic PostgreSQL advisory lock key for MediOS scheduler leader election. */
export const MEDIOS_JOB_SCHEDULER_LOCK_KEY = 'medios:job-scheduler:leader';

/** Production default; override via JOB_SCHEDULER_LEADER_LOCK_KEY for isolated integration tests. */
export function resolveJobSchedulerLeaderLockKey(): string {
  const override = process.env.JOB_SCHEDULER_LEADER_LOCK_KEY?.trim();
  return override || MEDIOS_JOB_SCHEDULER_LOCK_KEY;
}
