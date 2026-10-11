import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { buildPharmacyDispensingBillingDomainEvent } from './pharmacy-dispensing-billing-event.util';

@Injectable()
export class PharmacyDispensingBillingEnqueueService {
  private readonly logger = new Logger(PharmacyDispensingBillingEnqueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly jobService: JobService,
    private readonly auditService: AuditService,
  ) {}

  async enqueueForDispensing(input: {
    id: string;
    hospitalId: string;
    branchId: string | null;
    patientId: string;
  }): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const event = buildPharmacyDispensingBillingDomainEvent({
          dispensingId: input.id,
          patientId: input.patientId,
          hospitalId: input.hospitalId,
          branchId: input.branchId,
        });

        const outbox = await this.domainEventOutboxService.createInTransaction(
          tx,
          event,
        );

        await this.jobService.enqueueWithClient(tx, {
          hospitalId: input.hospitalId,
          branchId: input.branchId,
          type: JOB_TYPES.PHARMACY_DISPENSING_BILLING,
          idempotencyKey: `${JOB_TYPES.PHARMACY_DISPENSING_BILLING}:${input.id}`,
          payload: { outboxId: outbox.id },
          maxAttempts: 5,
        });
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'pharmacy_dispensing_billing_enqueue_failed',
          dispensingId: input.id,
          hospitalId: input.hospitalId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );

      await this.auditService.log({
        action: 'PHARMACY_BILLING_ENQUEUE_FAILED',
        entity: 'PharmacyDispensing',
        entityId: input.id,
        hospitalId: input.hospitalId,
        branchId: input.branchId,
        userId: null,
        metadata: {
          dispensingId: input.id,
          error: error instanceof Error ? error.message : 'unknown',
        },
      });
    }
  }
}
