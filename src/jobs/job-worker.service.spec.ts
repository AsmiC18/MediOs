import { Job, JobStatus } from '@prisma/client';
import { JobHandlerRegistry } from './job-handler.registry';
import { JobWorkerService } from './job-worker.service';
import { JobService } from './job.service';
import { UnknownJobTypeError } from './job-handler.types';

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    hospitalId: 'hospital-1',
    branchId: 'branch-1',
    type: 'worker.test.noop',
    idempotencyKey: 'key-1',
    payload: { entityId: 'x' },
    status: JobStatus.RUNNING,
    attempts: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: 'worker-a',
    lastError: null,
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('JobWorkerService', () => {
  let jobService: {
    claim: jest.Mock;
    complete: jest.Mock;
    fail: jest.Mock;
    recoverStale: jest.Mock;
  };
  let registry: JobHandlerRegistry;
  let service: JobWorkerService;

  beforeEach(() => {
    jobService = {
      claim: jest.fn().mockResolvedValue([]),
      complete: jest.fn().mockResolvedValue(buildJob({ status: JobStatus.COMPLETED })),
      fail: jest.fn().mockResolvedValue(buildJob({ status: JobStatus.PENDING })),
      recoverStale: jest.fn().mockResolvedValue(0),
    };
    registry = new JobHandlerRegistry();
    service = new JobWorkerService(
      jobService as unknown as JobService,
      registry,
    );
  });

  it('claims jobs through JobService during run', async () => {
    const job = buildJob();
    jobService.claim.mockResolvedValueOnce([job]).mockResolvedValue([]);

    registry.register('worker.test.noop', jest.fn().mockResolvedValue(undefined));

    const runPromise = service.run();
    await new Promise((resolve) => setImmediate(resolve));
    await service.stop();
    await runPromise;

    expect(jobService.claim).toHaveBeenCalled();
    expect(jobService.claim.mock.calls[0][0]).toBe(service.getWorkerId());
    expect(jobService.complete).toHaveBeenCalledWith(job.id, service.getWorkerId());
  });

  it('runs a registered handler and completes the job on success', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registry.register('worker.test.noop', handler);
    const job = buildJob();

    await service.executeJob(job);

    expect(handler).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ workerId: service.getWorkerId() }),
    );
    expect(jobService.complete).toHaveBeenCalledWith(job.id, service.getWorkerId());
    expect(jobService.fail).not.toHaveBeenCalled();
  });

  it('calls fail when the handler throws', async () => {
    registry.register('worker.test.noop', jest.fn().mockRejectedValue(new Error('boom')));
    const job = buildJob();

    await service.executeJob(job);

    expect(jobService.fail).toHaveBeenCalledWith(
      job.id,
      service.getWorkerId(),
      expect.any(Error),
    );
    expect(jobService.complete).not.toHaveBeenCalled();
  });

  it('fails unknown job types safely via JobService.fail', async () => {
    const job = buildJob({ type: 'unknown.type' });

    await service.executeJob(job);

    expect(jobService.fail).toHaveBeenCalledWith(
      job.id,
      service.getWorkerId(),
      expect.any(UnknownJobTypeError),
    );
  });

  it('continues processing after one job fails', async () => {
    registry.register('worker.test.noop', jest
      .fn()
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValueOnce(undefined));

    const jobs = [
      buildJob({ id: 'job-a' }),
      buildJob({ id: 'job-b' }),
    ];

    await (service as unknown as { processBatch: (j: Job[]) => Promise<void> }).processBatch(
      jobs,
    );

    expect(jobService.fail).toHaveBeenCalledTimes(1);
    expect(jobService.complete).toHaveBeenCalledTimes(1);
  });

  it('waits for the poll interval when no jobs are claimed', async () => {
    jest.useFakeTimers();
    process.env.JOB_WORKER_POLL_INTERVAL_MS = '2000';
    const pollingService = new JobWorkerService(
      jobService as unknown as JobService,
      registry,
    );
    jobService.claim.mockResolvedValue([]);

    const runPromise = pollingService.run();
    await jest.advanceTimersByTimeAsync(0);
    expect(jobService.claim).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1999);
    expect(jobService.claim).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(jobService.claim.mock.calls.length).toBeGreaterThanOrEqual(2);

    await pollingService.stop();
    await runPromise;
    jest.useRealTimers();
    delete process.env.JOB_WORKER_POLL_INTERVAL_MS;
  });

  it('invokes stale recovery on startup and during polling', async () => {
    process.env.JOB_WORKER_POLL_INTERVAL_MS = '10';
    const pollingService = new JobWorkerService(
      jobService as unknown as JobService,
      registry,
    );
    jobService.claim.mockResolvedValue([]);

    const runPromise = pollingService.run();
    await new Promise((resolve) => setTimeout(resolve, 25));
    await pollingService.stop();
    await runPromise;

    expect(jobService.recoverStale).toHaveBeenCalled();
    expect(jobService.recoverStale.mock.calls.length).toBeGreaterThanOrEqual(2);
    delete process.env.JOB_WORKER_POLL_INTERVAL_MS;
  }, 10_000);

  it('stops the polling loop on graceful shutdown', async () => {
    jobService.claim.mockResolvedValue([]);

    const runPromise = service.run();
    await new Promise((resolve) => setImmediate(resolve));
    const callsBeforeStop = jobService.claim.mock.calls.length;

    await service.stop();
    await runPromise;

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(jobService.claim.mock.calls.length).toBe(callsBeforeStop);
  });

  it('does not exceed batch-size concurrency when processing a batch', async () => {
    process.env.JOB_WORKER_BATCH_SIZE = '3';
    const concurrentRegistry = new JobHandlerRegistry();
    const concurrentService = new JobWorkerService(
      jobService as unknown as JobService,
      concurrentRegistry,
    );

    let inFlight = 0;
    let maxInFlight = 0;

    concurrentRegistry.register(
      'worker.test.noop',
      () =>
        new Promise<void>((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve();
          }, 20);
        }),
    );

    const jobs = [
      buildJob({ id: 'j1' }),
      buildJob({ id: 'j2' }),
      buildJob({ id: 'j3' }),
    ];

    await (
      concurrentService as unknown as { processBatch: (j: Job[]) => Promise<void> }
    ).processBatch(jobs);

    expect(maxInFlight).toBeLessThanOrEqual(3);
    delete process.env.JOB_WORKER_BATCH_SIZE;
  });
});
