import { Job } from '@prisma/client';

/** Trusted execution context for background job handlers (no JWT). */
export type JobExecutionContext = {
  workerId: string;
};

export type JobHandler = (
  job: Job,
  context: JobExecutionContext,
) => Promise<void>;

/** Thrown when no handler is registered for a job type; worker maps this to JobService.fail(). */
export class UnknownJobTypeError extends Error {
  constructor(public readonly jobType: string) {
    super(`No handler registered for job type: ${jobType}`);
    this.name = 'UnknownJobTypeError';
  }
}
