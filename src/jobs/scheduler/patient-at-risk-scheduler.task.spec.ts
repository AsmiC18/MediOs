import { JOB_TYPES } from '../job-types.constants';
import { PatientAtRiskSchedulerTask } from './patient-at-risk-scheduler.task';

describe('PatientAtRiskSchedulerTask', () => {
  const originalEnv = process.env.JOB_PATIENT_AT_RISK_SCHEDULER_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.JOB_PATIENT_AT_RISK_SCHEDULER_ENABLED;
    } else {
      process.env.JOB_PATIENT_AT_RISK_SCHEDULER_ENABLED = originalEnv;
    }
  });

  it('enqueues one hospital job per UTC day with correct idempotency key', async () => {
    process.env.JOB_PATIENT_AT_RISK_SCHEDULER_ENABLED = 'true';
    const task = new PatientAtRiskSchedulerTask();
    const enqueueWithClient = jest.fn().mockResolvedValue({ id: 'job-1' });
    const tickAt = new Date('2026-04-10T15:30:00.000Z');

    await task.run({
      windowKey: 'unused',
      tickAt,
      transaction: {
        hospital: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'hospital-a' }, { id: 'hospital-b' }]),
        },
      } as never,
      jobService: { enqueueWithClient } as never,
    });

    expect(enqueueWithClient).toHaveBeenCalledTimes(2);
    expect(enqueueWithClient).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        hospitalId: 'hospital-a',
        branchId: null,
        type: JOB_TYPES.PATIENT_AT_RISK_EVALUATE,
        idempotencyKey: `${JOB_TYPES.PATIENT_AT_RISK_EVALUATE}:hospital-a:2026-04-10`,
        payload: { window: '2026-04-10' },
        maxAttempts: 5,
      }),
    );
  });

  it('does not enqueue when scheduler flag is disabled', async () => {
    process.env.JOB_PATIENT_AT_RISK_SCHEDULER_ENABLED = 'false';
    const task = new PatientAtRiskSchedulerTask();
    const enqueueWithClient = jest.fn();

    await task.run({
      windowKey: 'w',
      tickAt: new Date('2026-04-10T00:00:00.000Z'),
      transaction: {
        hospital: { findMany: jest.fn() },
      } as never,
      jobService: { enqueueWithClient } as never,
    });

    expect(enqueueWithClient).not.toHaveBeenCalled();
  });
});
