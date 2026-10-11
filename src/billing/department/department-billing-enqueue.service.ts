import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobService } from '../../jobs/job.service';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { DomainEventEnvelope } from '../../notifications/domain-event.types';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';

@Injectable()
export class DepartmentBillingEnqueueService {
  private readonly logger = new Logger(DepartmentBillingEnqueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly jobService: JobService,
    private readonly auditService: AuditService,
  ) {}

  async enqueueAfterCommit(input: {
    event: DomainEventEnvelope;
    jobType: string;
    jobIdempotencyKey: string;
    auditAction: string;
    entity: string;
    entityId: string;
  }): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const outbox = await this.domainEventOutboxService.createInTransaction(
          tx,
          input.event,
        );

        await this.jobService.enqueueWithClient(tx, {
          hospitalId: input.event.hospitalId,
          branchId: input.event.branchId,
          type: input.jobType,
          idempotencyKey: input.jobIdempotencyKey,
          payload: { outboxId: outbox.id },
          maxAttempts: 5,
        });
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'department_billing_enqueue_failed',
          entity: input.entity,
          entityId: input.entityId,
          hospitalId: input.event.hospitalId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );

      await this.auditService.log({
        action: input.auditAction,
        entity: input.entity,
        entityId: input.entityId,
        hospitalId: input.event.hospitalId,
        branchId: input.event.branchId,
        userId: null,
        metadata: {
          error: error instanceof Error ? error.message : 'unknown',
        },
      });
    }
  }

  async enqueueInTransaction(
    tx: import('@prisma/client').Prisma.TransactionClient,
    input: {
      event: DomainEventEnvelope;
      jobType: string;
      jobIdempotencyKey: string;
    },
  ): Promise<void> {
    const outbox = await this.domainEventOutboxService.createInTransaction(
      tx,
      input.event,
    );

    await this.jobService.enqueueWithClient(tx, {
      hospitalId: input.event.hospitalId,
      branchId: input.event.branchId,
      type: input.jobType,
      idempotencyKey: input.jobIdempotencyKey,
      payload: { outboxId: outbox.id },
      maxAttempts: 5,
    });
  }
}

export const departmentBillingJobKey = (
  jobType: string,
  entityId: string,
): string => `${jobType}:${entityId}`;
