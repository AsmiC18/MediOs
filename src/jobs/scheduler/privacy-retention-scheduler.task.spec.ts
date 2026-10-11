import { JOB_TYPES } from '../job-types.constants';
import { PrivacyRetentionSchedulerTask } from './privacy-retention-scheduler.task';

describe('PrivacyRetentionSchedulerTask', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not enqueue when retention is disabled', async () => {
    process.env.PRIVACY_RETENTION_ENABLED = 'false';
    const enqueueWithClient = jest.fn();
    const task = new PrivacyRetentionSchedulerTask();

    await task.run({
      tickAt: new Date('2026-10-05T12:00:00Z'),
      transaction: {
        hospital: { findMany: jest.fn() },
      },
      jobService: { enqueueWithClient },
    } as never);

    expect(enqueueWithClient).not.toHaveBeenCalled();
  });

  it('enqueues one purge job per hospital per UTC day', async () => {
    process.env.PRIVACY_RETENTION_ENABLED = 'true';
    const enqueueWithClient = jest.fn();
    const task = new PrivacyRetentionSchedulerTask();

    await task.run({
      tickAt: new Date('2026-10-05T12:34:00Z'),
      transaction: {
        hospital: {
          findMany: jest.fn().mockResolvedValue([{ id: 'h1' }, { id: 'h2' }]),
        },
      },
      jobService: { enqueueWithClient },
    } as never);

    expect(enqueueWithClient).toHaveBeenCalledTimes(2);
    expect(enqueueWithClient.mock.calls[0][1]).toMatchObject({
      hospitalId: 'h1',
      type: JOB_TYPES.PRIVACY_RETENTION_PURGE,
      idempotencyKey: `${JOB_TYPES.PRIVACY_RETENTION_PURGE}:h1:2026-10-05`,
    });
  });
});
