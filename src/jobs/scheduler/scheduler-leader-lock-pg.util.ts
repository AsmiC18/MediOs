import { Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

const logger = new Logger('SchedulerLeaderLockPg');

let pool: Pool | null = null;
let activeHeldClient: PoolClient | null = null;
let activeHeldLockKey: string | null = null;

/** Leader sessions still holding the lock until underlying tick work settles. */
const inFlightLeaderSessions = new Set<Promise<void>>();

function getSchedulerLeaderLockPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for scheduler leader lock');
    }
    pool = new Pool({
      connectionString,
      max: 10,
    });
  }
  return pool;
}

function trackInFlightLeaderSession(session: Promise<void>): void {
  inFlightLeaderSessions.add(session);
  const untrack = (): void => {
    inFlightLeaderSessions.delete(session);
  };
  // Observe fulfillment and rejection so session cleanup never leaves a rejected promise unhandled.
  void session.then(untrack, untrack);
}

export async function tryAcquireSchedulerLeaderSessionLockPg(
  client: PoolClient,
  lockKey: string,
): Promise<boolean> {
  const result = await client.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
    [lockKey],
  );
  return result.rows[0]?.locked === true;
}

export async function releaseSchedulerLeaderSessionLockPg(
  client: PoolClient,
  lockKey: string,
): Promise<boolean> {
  const result = await client.query<{ unlocked: boolean }>(
    'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
    [lockKey],
  );
  return result.rows[0]?.unlocked === true;
}

/**
 * Unlocks the session advisory lock and returns the client to the pool.
 * On unlock failure the client is released with an error so it is not reused.
 */
export async function releaseLeaderLockClient(
  client: PoolClient,
  lockKey: string,
): Promise<void> {
  let unlockError: unknown;
  try {
    await releaseSchedulerLeaderSessionLockPg(client, lockKey);
  } catch (error) {
    unlockError = error;
    logger.warn(
      JSON.stringify({
        event: 'scheduler_leader_lock_release_failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  try {
    if (unlockError !== undefined) {
      const discardError =
        unlockError instanceof Error
          ? unlockError
          : new Error(String(unlockError));
      client.release(discardError);
    } else {
      client.release();
    }
  } catch (releaseError) {
    logger.warn(
      JSON.stringify({
        event: 'scheduler_leader_lock_client_release_failed',
        message:
          releaseError instanceof Error
            ? releaseError.message
            : String(releaseError),
      }),
    );
  }
}

export class SchedulerLeaderOrchestrationTimeoutError extends Error {
  constructor() {
    super('scheduler leader orchestration timed out');
    this.name = 'SchedulerLeaderOrchestrationTimeoutError';
  }
}

export type WithDedicatedSchedulerLeaderLockOptions = {
  /**
   * Wall-clock limit for reporting orchestration timeout to the caller.
   * Does not cancel Prisma work. The session lock stays held until tick work
   * settles (see workCompletion).
   */
  orchestrationTimeoutMs?: number;
};

export type DedicatedSchedulerLeaderLockResult<T> =
  | { acquired: false }
  | { acquired: true; result: T }
  | {
      acquired: true;
      orchestrationTimedOut: true;
      /** Resolves after tick work finishes and the lock is released. */
      workCompletion: Promise<void>;
    };

/**
 * Acquires a session advisory lock on a dedicated pooled connection, runs work,
 * then unlocks on the same connection.
 *
 * Orchestration timeout is a reporting boundary only: Promise.race does not stop
 * Prisma queries. On timeout the caller gets orchestrationTimedOut immediately
 * while workCompletion keeps the lock until fn() settles.
 *
 * A tick that never settles keeps the lock until process shutdown closes the
 * pool connection (PostgreSQL releases session locks when the session ends).
 */
export async function withDedicatedSchedulerLeaderLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  options?: WithDedicatedSchedulerLeaderLockOptions,
): Promise<DedicatedSchedulerLeaderLockResult<T>> {
  const client = await getSchedulerLeaderLockPool().connect();

  const finishSession = async (): Promise<void> => {
    await releaseLeaderLockClient(client, lockKey);
    if (activeHeldClient === client) {
      activeHeldClient = null;
      activeHeldLockKey = null;
    }
  };

  let acquired = false;
  try {
    acquired = await tryAcquireSchedulerLeaderSessionLockPg(client, lockKey);
    if (!acquired) {
      client.release();
      return { acquired: false };
    }

    activeHeldClient = client;
    activeHeldLockKey = lockKey;

    const workPromise = fn();
    const orchestrationTimeoutMs = options?.orchestrationTimeoutMs;

    if (orchestrationTimeoutMs != null && orchestrationTimeoutMs > 0) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const workCompletion = (async () => {
        try {
          await workPromise;
        } catch {
          // Tick work should handle task errors internally; do not mask timeouts.
        } finally {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
          await finishSession();
        }
      })();

      trackInFlightLeaderSession(workCompletion);

      const timeoutSignal = new Promise<'timeout'>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), orchestrationTimeoutMs);
      });

      let workError: unknown;
      let workResult: T;

      const workOutcome = workPromise.then(
        (result) => {
          workResult = result;
          return { kind: 'completed' as const };
        },
        (error: unknown) => {
          workError = error;
          return { kind: 'rejected' as const };
        },
      );

      const winner = await Promise.race([
        workOutcome,
        timeoutSignal.then(() => ({ kind: 'timeout' as const })),
      ]);

      if (winner.kind === 'timeout') {
        return {
          acquired: true,
          orchestrationTimedOut: true,
          workCompletion,
        };
      }

      await workCompletion;

      if (winner.kind === 'rejected') {
        throw workError;
      }

      return { acquired: true, result: workResult! };
    }

    try {
      const result = await workPromise;
      return { acquired: true, result };
    } finally {
      await finishSession();
    }
  } catch (error) {
    if (!acquired) {
      client.release();
    }
    throw error;
  }
}

/** Returns true when the lock key is not currently held by any session. */
export async function isSchedulerLeaderLockAvailable(
  lockKey: string,
): Promise<boolean> {
  const client = await getSchedulerLeaderLockPool().connect();
  try {
    const acquired = await tryAcquireSchedulerLeaderSessionLockPg(
      client,
      lockKey,
    );
    if (acquired) {
      await releaseSchedulerLeaderSessionLockPg(client, lockKey);
      return true;
    }
    return false;
  } finally {
    client.release();
  }
}

export type ShutdownSchedulerLeaderLockPoolOptions = {
  /**
   * When true, end the pool without waiting for ticks that never settle.
   * Active connections are discarded; PostgreSQL drops session locks on disconnect.
   */
  force?: boolean;
};

export async function shutdownSchedulerLeaderLockPool(
  options?: ShutdownSchedulerLeaderLockPoolOptions,
): Promise<void> {
  if (options?.force) {
    if (activeHeldClient && activeHeldLockKey) {
      try {
        await releaseLeaderLockClient(activeHeldClient, activeHeldLockKey);
      } catch {
        try {
          activeHeldClient.release(new Error('scheduler leader lock force shutdown'));
        } catch {
          // ignore
        }
      }
      activeHeldClient = null;
      activeHeldLockKey = null;
    }
  } else {
    await Promise.allSettled([...inFlightLeaderSessions]);
    if (activeHeldClient && activeHeldLockKey) {
      await releaseLeaderLockClient(activeHeldClient, activeHeldLockKey);
      activeHeldClient = null;
      activeHeldLockKey = null;
    }
  }

  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** @internal Resets pool singleton for isolated tests. */
export async function resetSchedulerLeaderLockPoolForTests(): Promise<void> {
  await shutdownSchedulerLeaderLockPool({ force: true });
}

/** @internal Await in-flight leader sessions (e.g. before graceful pool shutdown). */
export async function awaitInFlightSchedulerLeaderSessions(): Promise<void> {
  await Promise.allSettled([...inFlightLeaderSessions]);
}
