import { Injectable, Logger } from '@nestjs/common';
import { Job, JobStatus } from '@prisma/client';
import {
  JobExecutionContext,
  JobHandler,
  UnknownJobTypeError,
} from './job-handler.types';
import { JobHandlerRegistry } from './job-handler.registry';
import { JobService } from './job.service';
import { JobWorkerConfig, loadJobWorkerConfig } from './job-worker.config';
import { truncateJobError } from './job-error.util';
import { redactErrorMessage } from '../common/logging/log-redaction.util';
import { JobPermanentFailureError } from './job-permanent-failure.error';
import { randomBytes } from 'crypto';
import { hostname } from 'os';

type JobOutcome = 'completed' | 'failed';

@Injectable()
export class JobWorkerService {
  private readonly logger = new Logger(JobWorkerService.name);
  private readonly workerId: string;
  private readonly config: JobWorkerConfig;

  private running = false;
  private inFlight = 0;
  private wakePoll: (() => void) | null = null;

  constructor(
    private readonly jobService: JobService,
    private readonly handlerRegistry: JobHandlerRegistry,
  ) {
    this.workerId = `worker-${hostname()}-${process.pid}-${randomBytes(4).toString('hex')}`;
    this.config = loadJobWorkerConfig();
  }

  getWorkerId(): string {
    return this.workerId;
  }

  getConfig(): JobWorkerConfig {
    return this.config;
  }

  /** Runs the polling loop until {@link stop} is called. */
  async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.logger.log(
      JSON.stringify({
        event: 'worker_started',
        workerId: this.workerId,
        batchSize: this.config.batchSize,
        pollIntervalMs: this.config.pollIntervalMs,
        staleLeaseMs: this.config.staleLeaseMs,
        maxConcurrent: this.config.batchSize,
      }),
    );

    await this.recoverStaleJobs('startup');

    while (this.running) {
      await this.recoverStaleJobs('poll');

      const jobs = await this.jobService.claim(
        this.workerId,
        this.config.batchSize,
      );

      if (jobs.length === 0) {
        await this.waitForPollInterval();
        continue;
      }

      await this.processBatch(jobs);
    }

    await this.waitForInFlightDrain();
    this.logger.log(
      JSON.stringify({ event: 'worker_stopped', workerId: this.workerId }),
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    this.wakePoll?.();
    await this.waitForInFlightDrain();
  }

  /** Executes a single claimed job (used by the loop and tests). */
  async executeJob(job: Job): Promise<void> {
    const context: JobExecutionContext = { workerId: this.workerId };
    const started = Date.now();

    try {
      const handler = this.resolveHandler(job.type);
      await handler(job, context);
      await this.jobService.complete(job.id, this.workerId);
      this.logJobExecution(job, started, 'completed');
    } catch (error) {
      const safeError =
        error instanceof UnknownJobTypeError
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error));
      if (safeError instanceof JobPermanentFailureError) {
        await this.jobService.dead(job.id, this.workerId, safeError);
      } else {
        await this.jobService.fail(job.id, this.workerId, safeError);
      }
      this.logJobExecution(job, started, 'failed', safeError);
    }
  }

  async recoverStaleJobs(phase: 'startup' | 'poll'): Promise<void> {
    const recovered = await this.jobService.recoverStale(
      this.config.staleLeaseMs,
    );
    if (recovered > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'stale_jobs_recovered',
          workerId: this.workerId,
          phase,
          count: recovered,
        }),
      );
    }
  }

  private resolveHandler(jobType: string): JobHandler {
    const handler = this.handlerRegistry.get(jobType);
    if (!handler) {
      throw new UnknownJobTypeError(jobType);
    }
    return handler;
  }

  private async processBatch(jobs: Job[]): Promise<void> {
    const queue = [...jobs];
    const workers = Math.min(this.config.batchSize, queue.length);
    const runners = Array.from({ length: workers }, async () => {
      while (queue.length > 0) {
        const job = queue.shift();
        if (!job) {
          return;
        }
        this.inFlight += 1;
        try {
          await this.executeJob(job);
        } catch (error) {
          this.logger.error(
            JSON.stringify({
              event: 'job_execution_unhandled',
              workerId: this.workerId,
              jobId: job.id,
              jobType: job.type,
              message: redactErrorMessage(truncateJobError(error)),
            }),
          );
        } finally {
          this.inFlight -= 1;
        }
      }
    });
    await Promise.all(runners);
  }

  private logJobExecution(
    job: Job,
    startedMs: number,
    outcome: JobOutcome,
    error?: Error,
  ): void {
    const payload: Record<string, unknown> = {
      event: 'job_executed',
      workerId: this.workerId,
      jobId: job.id,
      jobType: job.type,
      hospitalId: job.hospitalId,
      branchId: job.branchId,
      attempt: job.attempts,
      durationMs: Date.now() - startedMs,
      outcome,
      status: outcome === 'completed' ? JobStatus.COMPLETED : undefined,
    };
    if (error) {
      payload.error = redactErrorMessage(truncateJobError(error));
    }
    if (outcome === 'failed') {
      this.logger.warn(JSON.stringify(payload));
    } else {
      this.logger.log(JSON.stringify(payload));
    }
  }

  private waitForPollInterval(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wakePoll = null;
        resolve();
      }, this.config.pollIntervalMs);
      this.wakePoll = () => {
        clearTimeout(timer);
        this.wakePoll = null;
        resolve();
      };
    });
  }

  private async waitForInFlightDrain(): Promise<void> {
    while (this.inFlight > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
