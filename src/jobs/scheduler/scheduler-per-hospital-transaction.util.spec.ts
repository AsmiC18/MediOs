import { runSchedulerTaskForEachHospital } from './scheduler-per-hospital-transaction.util';
import { SchedulerTask } from './scheduler.types';

const baseOptions = {
  scheduler: 'medios-job-scheduler-tick',
  windowKey: '2026-10-04T18:42Z',
  taskName: 'multi-hospital-task',
  taskIndex: 0,
  taskTransactionTimeoutMs: 5_000,
  taskTransactionMaxWaitMs: 10_000,
  hospitalConcurrency: 2,
};

describe('runSchedulerTaskForEachHospital', () => {
  it('runs one transaction per hospital and passes hospitalId', async () => {
    const transactionCalls: string[] = [];
    const prisma = {
      hospital: {
        findMany: jest.fn().mockResolvedValue([{ id: 'h-1' }, { id: 'h-2' }]),
      },
      $transaction: jest.fn(
        async (callback: (tx: { marker: string }) => Promise<void>) => {
          const marker = `tx-${transactionCalls.length + 1}`;
          transactionCalls.push(marker);
          await callback({
            marker,
            $executeRaw: jest.fn().mockResolvedValue(0),
          } as never);
        },
      ),
    };

    const task: SchedulerTask = {
      name: 'multi-hospital-task',
      usesPerHospitalTransactions: true,
      run: jest.fn(async (context) => {
        expect(context.hospitalId).toBeDefined();
        expect(context.transaction).toEqual(
          expect.objectContaining({ marker: expect.any(String) }),
        );
      }),
    };

    await runSchedulerTaskForEachHospital(
      prisma as never,
      task,
      {
        windowKey: '2026-10-04T18:42Z',
        tickAt: new Date('2026-10-04T18:42:10Z'),
        jobService: {} as never,
      },
      baseOptions,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(task.run).toHaveBeenCalledTimes(2);
    expect(task.run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ hospitalId: 'h-1' }),
    );
    expect(task.run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ hospitalId: 'h-2' }),
    );
  });

  it('keeps earlier hospitals committed when a later hospital fails', async () => {
    const prisma = {
      hospital: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'h-ok' }, { id: 'h-fail' }]),
      },
      $transaction: jest.fn(
        async (
          callback: (tx: unknown) => Promise<void>,
          _options?: unknown,
        ) => {
          await callback({ $executeRaw: jest.fn().mockResolvedValue(0) });
        },
      ),
    };

    const task: SchedulerTask = {
      name: 'partial-failure-task',
      usesPerHospitalTransactions: true,
      run: jest.fn(async (context) => {
        if (context.hospitalId === 'h-fail') {
          throw new Error('hospital failed');
        }
      }),
    };

    await expect(
      runSchedulerTaskForEachHospital(
        prisma as never,
        task,
        {
          windowKey: 'w',
          tickAt: new Date(),
          jobService: {} as never,
        },
        baseOptions,
      ),
    ).rejects.toThrow('hospital failed');

    expect(task.run).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
