import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DiagnosticAggregatorSubmissionStatus,
  DiagnosticOrderStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { DIAGNOSTIC_LAB_AGGREGATOR_ADAPTER } from './adapters/diagnostic-lab-aggregator.adapter';
import type { DiagnosticLabAggregatorAdapter } from './adapters/diagnostic-lab-aggregator.adapter';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const SUBMITTABLE_STATUSES: DiagnosticOrderStatus[] = [
  DiagnosticOrderStatus.SAMPLE_COLLECTED,
  DiagnosticOrderStatus.PROCESSING,
];

@Injectable()
export class DiagnosticAggregatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: JobService,
    private readonly auditService: AuditService,
    @Inject(DIAGNOSTIC_LAB_AGGREGATOR_ADAPTER)
    private readonly aggregatorAdapter: DiagnosticLabAggregatorAdapter,
  ) {}

  private async findOwnedOrder(user: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.diagnosticOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order || order.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Diagnostic order not found');
    }

    assertBranchAccess(user, order.branchId);

    return order;
  }

  async requestAggregatorSubmission(user: AuthenticatedUser, orderId: string) {
    const order = await this.findOwnedOrder(user, orderId);

    if (order.status === DiagnosticOrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be submitted');
    }

    if (order.status === DiagnosticOrderStatus.COMPLETED) {
      throw new BadRequestException('Completed orders cannot be submitted');
    }

    if (!SUBMITTABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        'Order must have sample collected before aggregator submission',
      );
    }

    if (
      order.aggregatorSubmissionStatus !==
      DiagnosticAggregatorSubmissionStatus.NONE
    ) {
      throw new ConflictException(
        'Diagnostic order was already submitted to the lab aggregator workflow',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.jobService.enqueueWithClient(tx, {
        hospitalId: order.hospitalId,
        branchId: order.branchId,
        type: JOB_TYPES.DIAGNOSTIC_AGGREGATOR_SUBMIT,
        idempotencyKey: `${JOB_TYPES.DIAGNOSTIC_AGGREGATOR_SUBMIT}:${order.id}`,
        payload: { orderId: order.id },
        maxAttempts: 5,
      });
    });

    await this.auditService.log({
      action: 'DIAGNOSTIC_AGGREGATOR_SUBMIT_REQUESTED',
      entity: 'DiagnosticOrder',
      entityId: order.id,
      hospitalId: user.hospitalId,
      branchId: order.branchId,
      userId: user.sub,
      metadata: {
        orderNumber: order.orderNumber,
        patientId: order.patientId,
      },
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'SUBMIT_JOB_ENQUEUED',
    };
  }

  async processAggregatorSubmitJob(input: {
    hospitalId: string;
    orderId: string;
    jobId: string;
    workerId: string;
  }): Promise<{ outcome: string }> {
    const order = await this.prisma.diagnosticOrder.findFirst({
      where: { id: input.orderId, hospitalId: input.hospitalId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Diagnostic order not found for submit job');
    }

    if (
      order.aggregatorSubmissionStatus !==
      DiagnosticAggregatorSubmissionStatus.NONE
    ) {
      return { outcome: 'already_processed' };
    }

    const result = await this.aggregatorAdapter.submitOrder({
      hospitalId: order.hospitalId,
      branchId: order.branchId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      patientId: order.patientId,
      itemCount: order.items.length,
    });

    if (result.outcome === 'MANUAL_REQUIRED') {
      await this.prisma.diagnosticOrder.update({
        where: { id: order.id },
        data: {
          aggregatorSubmissionStatus:
            DiagnosticAggregatorSubmissionStatus.MANUAL_REQUIRED,
          aggregatorSubmittedAt: new Date(),
        },
      });

      await this.auditService.log({
        action: 'DIAGNOSTIC_AGGREGATOR_MANUAL_REQUIRED',
        entity: 'DiagnosticOrder',
        entityId: order.id,
        hospitalId: order.hospitalId,
        branchId: order.branchId,
        userId: null,
        metadata: {
          jobId: input.jobId,
          workerId: input.workerId,
          message: result.message,
        },
      });

      return { outcome: 'MANUAL_REQUIRED' };
    }

    await this.prisma.diagnosticOrder.update({
      where: { id: order.id },
      data: {
        aggregatorSubmissionStatus:
          DiagnosticAggregatorSubmissionStatus.EXTERNAL_SUBMITTED,
        aggregatorExternalReference: result.externalReference,
        aggregatorSubmittedAt: new Date(),
      },
    });

    await this.auditService.log({
      action: 'DIAGNOSTIC_AGGREGATOR_EXTERNAL_SUBMITTED',
      entity: 'DiagnosticOrder',
      entityId: order.id,
      hospitalId: order.hospitalId,
      branchId: order.branchId,
      userId: null,
      metadata: {
        jobId: input.jobId,
        workerId: input.workerId,
        externalReference: result.externalReference,
      },
    });

    return { outcome: 'EXTERNAL_SUBMITTED' };
  }
}
