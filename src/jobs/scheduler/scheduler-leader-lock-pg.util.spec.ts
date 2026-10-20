import { PoolClient } from 'pg';
import {
  awaitInFlightSchedulerLeaderSessions,
  releaseLeaderLockClient,
  releaseSchedulerLeaderSessionLockPg,
  resetSchedulerLeaderLockPoolForTests,
  tryAcquireSchedulerLeaderSessionLockPg,
  withDedicatedSchedulerLeaderLock,
} from './scheduler-leader-lock-pg.util';

function createMockClient(): PoolClient & {
  query: jest.Mock;
  release: jest.Mock;
} {
  return {
    query: jest.fn(),
    release: jest.fn(),
  } as unknown as PoolClient & { query: jest.Mock; release: jest.Mock };
}

jest.mock('pg', () => {
  const connect = jest.fn();
  const end = jest.fn().mockResolvedValue(undefined);
  const Pool = jest.fn(() => ({ connect, end }));
  return { Pool, __connectMock: connect, __endMock: end };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pgModule = require('pg') as { __connectMock: jest.Mock };

describe('scheduler-leader-lock-pg.util (unit)', () => {
  beforeEach(async () => {
    await resetSchedulerLeaderLockPoolForTests();
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
  });

  it('releases lock after successful work', async () => {
    const client = createMockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    pgModule.__connectMock.mockResolvedValue(client);

    const result = await withDedicatedSchedulerLeaderLock('lock-key', async () => {
      return 'done';
    });

    expect(result).toEqual({ acquired: true, result: 'done' });
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith();
  });

  it('releases lock after task failure inside leader work', async () => {
    const client = createMockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    pgModule.__connectMock.mockResolvedValue(client);

    await expect(
      withDedicatedSchedulerLeaderLock('lock-key', async () => {
        throw new Error('task failed');
      }),
    ).rejects.toThrow('task failed');

    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
      ['lock-key'],
    );
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith();
  });

  it('completes successfully when orchestration timeout is configured', async () => {
    const client = createMockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    pgModule.__connectMock.mockResolvedValue(client);

    const result = await withDedicatedSchedulerLeaderLock(
      'lock-key',
      async () => 'ok',
      { orchestrationTimeoutMs: 500 },
    );

    expect(result).toEqual({ acquired: true, result: 'ok' });
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('propagates work rejection when orchestration timeout is configured', async () => {
    const client = createMockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    pgModule.__connectMock.mockResolvedValue(client);

    const taskError = new Error('task failed under race');

    await expect(
      withDedicatedSchedulerLeaderLock(
        'lock-key',
        async () => {
          throw taskError;
        },
        { orchestrationTimeoutMs: 500 },
      ),
    ).rejects.toThrow('task failed under race');

    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
      ['lock-key'],
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('returns orchestration timeout while work is pending and keeps the advisory lock held', async () => {
    const client = createMockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    pgModule.__connectMock.mockResolvedValue(client);

    let workSettled = false;
    let releaseWork: (() => void) | undefined;
    const workGate = new Promise<void>((resolve) => {
      releaseWork = () => {
        workSettled = true;
        resolve();
      };
    });

    const lockRun = await withDedicatedSchedulerLeaderLock(
      'lock-key',
      () => workGate,
      { orchestrationTimeoutMs: 25 },
    );

    expect(lockRun).toEqual({
      acquired: true,
      orchestrationTimedOut: true,
      workCompletion: expect.any(Promise),
    });
    expect(workSettled).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      ['lock-key'],
    );
    expect(client.query).not.toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
      ['lock-key'],
    );
    expect(client.release).not.toHaveBeenCalled();

    releaseWork!();
    if (!('workCompletion' in lockRun)) {
      throw new Error('expected orchestration timeout result');
    }
    await expect(lockRun.workCompletion).resolves.toBeUndefined();
    await awaitInFlightSchedulerLeaderSessions();

    expect(workSettled).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
      ['lock-key'],
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('settles workCompletion without unhandled rejection when work rejects after orchestration timeout', async () => {
    const client = createMockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    pgModule.__connectMock.mockResolvedValue(client);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const lockRun = await withDedicatedSchedulerLeaderLock(
        'lock-key',
        () =>
          new Promise<void>((_resolve, reject) => {
            setTimeout(() => reject(new Error('late task failure')), 40);
          }),
        { orchestrationTimeoutMs: 10 },
      );

      expect(lockRun).toEqual({
        acquired: true,
        orchestrationTimedOut: true,
        workCompletion: expect.any(Promise),
      });

      if (!('workCompletion' in lockRun)) {
        throw new Error('expected orchestration timeout result');
      }
      await expect(lockRun.workCompletion).resolves.toBeUndefined();
      await awaitInFlightSchedulerLeaderSessions();

      expect(unhandled).toEqual([]);
      expect(client.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
        ['lock-key'],
      );
      expect(client.release).toHaveBeenCalledTimes(1);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('returns acquired false without calling unlock when lock is busy', async () => {
    const client = createMockClient();
    client.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
    pgModule.__connectMock.mockResolvedValue(client);

    const fn = jest.fn();
    const result = await withDedicatedSchedulerLeaderLock('lock-key', fn);

    expect(result).toEqual({ acquired: false });
    expect(fn).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('discards client when pg_advisory_unlock fails', async () => {
    const client = createMockClient();
    client.query.mockRejectedValueOnce(new Error('unlock failed'));

    await releaseLeaderLockClient(client, 'lock-key');

    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(client.release.mock.calls[0][0].message).toContain('unlock failed');
  });
});

describe('scheduler-leader-lock-pg SQL helpers', () => {
  it('maps pg_try_advisory_lock result', async () => {
    const client = createMockClient();
    client.query.mockResolvedValueOnce({ rows: [{ locked: true }] });
    await expect(
      tryAcquireSchedulerLeaderSessionLockPg(client, 'k'),
    ).resolves.toBe(true);
  });

  it('maps pg_advisory_unlock result', async () => {
    const client = createMockClient();
    client.query.mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    await expect(
      releaseSchedulerLeaderSessionLockPg(client, 'k'),
    ).resolves.toBe(true);
  });
});
