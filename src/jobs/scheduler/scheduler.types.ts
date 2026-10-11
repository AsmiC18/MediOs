import { Prisma } from '@prisma/client';
import { JobService } from '../job.service';

export type SchedulerExecutionContext = {
  /** UTC minute bucket key, e.g. 2026-10-04T18:42Z */
  windowKey: string;
  tickAt: Date;
  /** Present when the task uses JOB_SCHEDULER_TEST_HOSPITAL_ID scope. */
  hospitalId?: string;
  transaction: Prisma.TransactionClient;
  jobService: JobService;
};

export interface SchedulerTask {
  readonly name: string;
  /**
   * When true, runTick skips the task unless JOB_SCHEDULER_TEST_HOSPITAL_ID is set.
   * Production tasks that resolve hospital scope themselves leave this unset/false.
   */
  readonly requiresTestHospitalId?: boolean;
  run(context: SchedulerExecutionContext): Promise<void>;
}

export function schedulerTaskRequiresTestHospitalId(task: SchedulerTask): boolean {
  return task.requiresTestHospitalId === true;
}

export type SchedulerTickResult = {
  windowKey: string;
  leaderAcquired: boolean;
  tasksRun: number;
  taskOutcomes: Array<{ name: string; outcome: 'success' | 'failed' }>;
  durationMs: number;
};
