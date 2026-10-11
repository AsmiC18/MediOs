import { Job, JobStatus } from '@prisma/client';
import { JobHandlerRegistry } from '../jobs/job-handler.registry';
import { JobWorkerService } from '../jobs/job-worker.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { PaymentReconciliationJobHandler } from './payment-reconciliation.job-handler';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import {
  PaymentReconciliationOutcome,
  PaymentReconciliationResult,
} from './payment-reconciliation.types';
import { RazorpayReadError } from './razorpay.errors';
import { RefundReconciliationJobHandler } from './refund-reconciliation.job-handler';
import { RefundReconciliationService } from './refund-reconciliation.service';
import { RefundReconciliationResult } from './refund-reconciliation.types';

const hospitalJobId = 'hospital-job-11111111-1111-4111-8111-111111111111';
const otherHospitalId = 'hospital-other-22222222-2222-4222-8222-222222222222';
const workerId = 'worker-test-1';
const paymentEntityId = 'pay-entity-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const refundEntityId = 'ref-entity-cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function buildJob(
  type: string,
  payload: Record<string, unknown>,
  hospitalId: string,
): Job {
  return {
    id: 'job-id-1',
    hospitalId,
    branchId: null,
    type,
    idempotencyKey: 'idem-1',
    payload,
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Job;
}

function paymentResult(
  outcome: PaymentReconciliationOutcome,
  overrides: Partial<PaymentReconciliationResult> = {},
): PaymentReconciliationResult {
  return {
    outcome,
    paymentId: paymentEntityId,
    hospitalId: hospitalJobId,
    ...overrides,
  };
}

function refundResult(
  outcome: RefundReconciliationResult['outcome'],
  overrides: Partial<RefundReconciliationResult> = {},
): RefundReconciliationResult {
  return {
    outcome,
    refundId: refundEntityId,
    hospitalId: hospitalJobId,
    ...overrides,
  };
}

describe('Billing reconciliation job handlers', () => {
  describe('PaymentReconciliationJobHandler', () => {
    let reconcilePayment: jest.Mock;
    let handler: PaymentReconciliationJobHandler;

    beforeEach(() => {
      reconcilePayment = jest.fn();
      handler = new PaymentReconciliationJobHandler({
        reconcilePayment,
      } as unknown as PaymentReconciliationService);
    });

    it('A. calls reconciliation service with paymentId and job hospitalId', async () => {
      reconcilePayment.mockResolvedValue(paymentResult('no_match'));
      const job = buildJob(
        JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        { paymentId: paymentEntityId },
        hospitalJobId,
      );

      await handler.handle(job, { workerId });

      expect(reconcilePayment).toHaveBeenCalledWith(
        paymentEntityId,
        hospitalJobId,
        {
          jobId: job.id,
          workerId,
          source: 'background_job',
        },
      );
    });

    it('AD. passes SystemJobExecutionContext fields as reconciliation context', async () => {
      reconcilePayment.mockResolvedValue(paymentResult('resolved'));
      const job = buildJob(
        JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        { paymentId: paymentEntityId },
        hospitalJobId,
      );

      await handler.handle(job, { workerId });

      expect(reconcilePayment.mock.calls[0][2]).toEqual({
        jobId: 'job-id-1',
        workerId,
        source: 'background_job',
      });
    });

    it('X/Y/Z. uses job.hospitalId even when payload carries another hospitalId', async () => {
      reconcilePayment.mockResolvedValue(paymentResult('no_change'));
      const job = buildJob(
        JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        { paymentId: paymentEntityId, hospitalId: otherHospitalId },
        hospitalJobId,
      );

      await handler.handle(job, { workerId });

      expect(reconcilePayment.mock.calls[0][1]).toBe(hospitalJobId);
    });

    it('C. propagates retryable RazorpayReadError for JobService retry', async () => {
      reconcilePayment.mockRejectedValue(
        new RazorpayReadError('retryable', 'timeout'),
      );
      const job = buildJob(
        JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        { paymentId: paymentEntityId },
        hospitalJobId,
      );

      await expect(handler.handle(job, { workerId })).rejects.toBeInstanceOf(
        RazorpayReadError,
      );
    });

    it('E. propagates permanent RazorpayReadError', async () => {
      reconcilePayment.mockRejectedValue(
        new RazorpayReadError('permanent', 'bad request'),
      );
      const job = buildJob(
        JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        { paymentId: paymentEntityId },
        hospitalJobId,
      );

      await expect(handler.handle(job, { workerId })).rejects.toBeInstanceOf(
        RazorpayReadError,
      );
    });

    it.each([
      ['G', 'not_found'],
      ['I', 'no_match'],
      ['K', 'ambiguous'],
      ['M', 'mismatch'],
      ['O', 'resolved'],
      ['no_change', 'no_change'],
    ] as const)(
      '%s. payment outcome %s completes without throwing',
      async (_label, outcome) => {
        reconcilePayment.mockResolvedValue(paymentResult(outcome));
        const job = buildJob(
          JOB_TYPES.BILLING_PAYMENT_RECONCILE,
          { paymentId: paymentEntityId },
          hospitalJobId,
        );

        const result = await handler.handle(job, { workerId });
        expect(result.outcome).toBe(outcome);
      },
    );

    it('O-ext. concurrent_resolution message completes normally', async () => {
      reconcilePayment.mockResolvedValue(
        paymentResult('resolved', { message: 'concurrent_resolution' }),
      );
      const job = buildJob(
        JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        { paymentId: paymentEntityId },
        hospitalJobId,
      );

      const result = await handler.handle(job, { workerId });
      expect(result.message).toBe('concurrent_resolution');
    });

  });

  describe('JobWorkerService wiring (AF/AG)', () => {
    it('AF. retryable errors reach JobService.fail via worker executeJob', async () => {
      const reconcilePayment = jest
        .fn()
        .mockRejectedValue(new RazorpayReadError('retryable', 'timeout'));
      const paymentHandler = new PaymentReconciliationJobHandler({
        reconcilePayment,
      } as unknown as PaymentReconciliationService);

      const jobService = {
        complete: jest.fn(),
        fail: jest.fn().mockResolvedValue(undefined),
      };
      const registry = new JobHandlerRegistry();
      registry.register(JOB_TYPES.BILLING_PAYMENT_RECONCILE, (job, ctx) =>
        paymentHandler.handle(job, ctx),
      );
      const worker = new JobWorkerService(jobService as never, registry);
      const job = {
        ...buildJob(
          JOB_TYPES.BILLING_PAYMENT_RECONCILE,
          { paymentId: paymentEntityId },
          hospitalJobId,
        ),
        status: JobStatus.RUNNING,
      };

      await worker.executeJob(job);
      expect(jobService.fail).toHaveBeenCalledWith(
        job.id,
        worker.getWorkerId(),
        expect.any(RazorpayReadError),
      );
      expect(jobService.complete).not.toHaveBeenCalled();
    });

    it('AG. business outcomes complete via JobService.complete', async () => {
      const reconcilePayment = jest
        .fn()
        .mockResolvedValue(paymentResult('no_match'));
      const paymentHandler = new PaymentReconciliationJobHandler({
        reconcilePayment,
      } as unknown as PaymentReconciliationService);

      const jobService = {
        complete: jest.fn().mockResolvedValue(undefined),
        fail: jest.fn(),
      };
      const registry = new JobHandlerRegistry();
      registry.register(JOB_TYPES.BILLING_PAYMENT_RECONCILE, (job, ctx) =>
        paymentHandler.handle(job, ctx),
      );
      const worker = new JobWorkerService(jobService as never, registry);
      const job = {
        ...buildJob(
          JOB_TYPES.BILLING_PAYMENT_RECONCILE,
          { paymentId: paymentEntityId },
          hospitalJobId,
        ),
        status: JobStatus.RUNNING,
      };

      await worker.executeJob(job);
      expect(jobService.complete).toHaveBeenCalledWith(job.id, worker.getWorkerId());
      expect(jobService.fail).not.toHaveBeenCalled();
    });
  });

  describe('RefundReconciliationJobHandler', () => {
    let reconcileRefund: jest.Mock;
    let handler: RefundReconciliationJobHandler;

    beforeEach(() => {
      reconcileRefund = jest.fn();
      handler = new RefundReconciliationJobHandler({
        reconcileRefund,
      } as unknown as RefundReconciliationService);
    });

    it('B. calls reconciliation service with refundId and job hospitalId', async () => {
      reconcileRefund.mockResolvedValue(refundResult('no_match'));
      const job = buildJob(
        JOB_TYPES.BILLING_REFUND_RECONCILE,
        { refundId: refundEntityId },
        hospitalJobId,
      );

      await handler.handle(job, { workerId });

      expect(reconcileRefund).toHaveBeenCalledWith(
        refundEntityId,
        hospitalJobId,
        {
          jobId: job.id,
          workerId,
          source: 'background_job',
        },
      );
    });

    it('AE. passes background_job audit context', async () => {
      reconcileRefund.mockResolvedValue(refundResult('resolved'));
      const job = buildJob(
        JOB_TYPES.BILLING_REFUND_RECONCILE,
        { refundId: refundEntityId },
        hospitalJobId,
      );

      await handler.handle(job, { workerId });

      expect(reconcileRefund.mock.calls[0][2]).toMatchObject({
        source: 'background_job',
        jobId: job.id,
        workerId,
      });
    });

    it('D. propagates retryable RazorpayReadError', async () => {
      reconcileRefund.mockRejectedValue(
        new RazorpayReadError('retryable', '429'),
      );
      const job = buildJob(
        JOB_TYPES.BILLING_REFUND_RECONCILE,
        { refundId: refundEntityId },
        hospitalJobId,
      );

      await expect(handler.handle(job, { workerId })).rejects.toBeInstanceOf(
        RazorpayReadError,
      );
    });

    it('F. propagates permanent RazorpayReadError', async () => {
      reconcileRefund.mockRejectedValue(
        new RazorpayReadError('permanent', '401'),
      );
      const job = buildJob(
        JOB_TYPES.BILLING_REFUND_RECONCILE,
        { refundId: refundEntityId },
        hospitalJobId,
      );

      await expect(handler.handle(job, { workerId })).rejects.toBeInstanceOf(
        RazorpayReadError,
      );
    });

    it.each([
      ['H', 'not_found'],
      ['J', 'no_match'],
      ['L', 'ambiguous'],
      ['N', 'mismatch'],
      ['P', 'resolved'],
    ] as const)('%s. refund outcome %s completes normally', async (_label, outcome) => {
      reconcileRefund.mockResolvedValue(refundResult(outcome));
      const job = buildJob(
        JOB_TYPES.BILLING_REFUND_RECONCILE,
        { refundId: refundEntityId },
        hospitalJobId,
      );

      const result = await handler.handle(job, { workerId });
      expect(result.outcome).toBe(outcome);
    });
  });
});
