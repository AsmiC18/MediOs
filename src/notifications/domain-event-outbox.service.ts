import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DomainEventOutbox,
  DomainEventOutboxStatus,
  Job,
  Prisma,
} from '@prisma/client';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { PrismaService } from '../common/prisma/prisma.service';
import { DomainEventEnvelope } from './domain-event.types';

export type EnqueueNotificationDispatchInput = {
  hospitalId: string;
  branchId?: string | null;
  outboxId: string;
  /** Defaults to notification.dispatch:{outboxId} */
  idempotencyKey?: string;
};

export type EnqueueStaffAttendanceConsultationInput = {
  hospitalId: string;
  branchId?: string | null;
  outboxId: string;
};

@Injectable()
export class DomainEventOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: JobService,
  ) {}

  /**
   * Inserts an outbox row using the caller's transaction client so the event
   * commits or rolls back with the surrounding business write.
   */
  async createInTransaction(
    client: Prisma.TransactionClient,
    event: DomainEventEnvelope,
  ): Promise<DomainEventOutbox> {
    return client.domainEventOutbox.create({
      data: {
        hospitalId: event.hospitalId,
        branchId: event.branchId ?? null,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        idempotencyKey: event.idempotencyKey,
        payload: event.payload,
        status: DomainEventOutboxStatus.PENDING,
      },
    });
  }

  async findByIdForHospital(
    outboxId: string,
    hospitalId: string,
  ): Promise<DomainEventOutbox | null> {
    return this.prisma.domainEventOutbox.findFirst({
      where: { id: outboxId, hospitalId },
    });
  }

  async markProcessed(
    outboxId: string,
    hospitalId: string,
    client?: Prisma.TransactionClient,
  ): Promise<DomainEventOutbox> {
    const db = client ?? this.prisma;
    const updated = await db.domainEventOutbox.updateMany({
      where: {
        id: outboxId,
        hospitalId,
        status: DomainEventOutboxStatus.PENDING,
      },
      data: {
        status: DomainEventOutboxStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new NotFoundException(
        'Outbox event not found or not pending for hospital',
      );
    }

    const row = await db.domainEventOutbox.findFirst({
      where: { id: outboxId, hospitalId },
    });
    if (!row) {
      throw new NotFoundException('Outbox event not found after update');
    }
    return row;
  }

  async markFailed(
    outboxId: string,
    hospitalId: string,
    client?: Prisma.TransactionClient,
  ): Promise<DomainEventOutbox> {
    const db = client ?? this.prisma;
    const updated = await db.domainEventOutbox.updateMany({
      where: {
        id: outboxId,
        hospitalId,
        status: DomainEventOutboxStatus.PENDING,
      },
      data: {
        status: DomainEventOutboxStatus.FAILED,
        processedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new NotFoundException(
        'Outbox event not found or not pending for hospital',
      );
    }

    const row = await db.domainEventOutbox.findFirst({
      where: { id: outboxId, hospitalId },
    });
    if (!row) {
      throw new NotFoundException('Outbox event not found after update');
    }
    return row;
  }

  /**
   * Enqueues notification.dispatch within the caller's transaction (same pattern as billing scheduler).
   */
  async enqueueDispatchInTransaction(
    client: Prisma.TransactionClient,
    input: EnqueueNotificationDispatchInput,
  ): Promise<Job> {
    return this.jobService.enqueueWithClient(client, {
      hospitalId: input.hospitalId,
      branchId: input.branchId ?? null,
      type: JOB_TYPES.NOTIFICATION_DISPATCH,
      idempotencyKey:
        input.idempotencyKey ?? `notification.dispatch:${input.outboxId}`,
      payload: { outboxId: input.outboxId },
      maxAttempts: 5,
    });
  }

  /** Enqueues pharmacy prescription worklist processing (not dispensing). */
  async enqueuePharmacyPrescriptionProcessInTransaction(
    client: Prisma.TransactionClient,
    input: EnqueueNotificationDispatchInput,
  ): Promise<Job> {
    return this.jobService.enqueueWithClient(client, {
      hospitalId: input.hospitalId,
      branchId: input.branchId ?? null,
      type: JOB_TYPES.PHARMACY_PRESCRIPTION_PROCESS,
      idempotencyKey: `${JOB_TYPES.PHARMACY_PRESCRIPTION_PROCESS}:${input.outboxId}`,
      payload: { outboxId: input.outboxId },
      maxAttempts: 5,
    });
  }

  /** Enqueues staff attendance consultation billing (not notification/WhatsApp). */
  async enqueueStaffAttendanceConsultationInTransaction(
    client: Prisma.TransactionClient,
    input: EnqueueStaffAttendanceConsultationInput,
  ): Promise<Job> {
    return this.jobService.enqueueWithClient(client, {
      hospitalId: input.hospitalId,
      branchId: input.branchId ?? null,
      type: JOB_TYPES.STAFF_ATTENDANCE_CONSULTATION,
      idempotencyKey: `${JOB_TYPES.STAFF_ATTENDANCE_CONSULTATION}:process:${input.outboxId}`,
      payload: { outboxId: input.outboxId },
      maxAttempts: 5,
    });
  }

  /** Marks PENDING outbox as PROCESSED, or returns the row if already PROCESSED. */
  async markProcessedIfPending(
    outboxId: string,
    hospitalId: string,
    client: Prisma.TransactionClient,
  ): Promise<DomainEventOutbox> {
    const updated = await client.domainEventOutbox.updateMany({
      where: {
        id: outboxId,
        hospitalId,
        status: DomainEventOutboxStatus.PENDING,
      },
      data: {
        status: DomainEventOutboxStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    if (updated.count === 1) {
      return client.domainEventOutbox.findFirstOrThrow({
        where: { id: outboxId, hospitalId },
      });
    }

    const row = await client.domainEventOutbox.findFirst({
      where: { id: outboxId, hospitalId },
    });
    if (!row) {
      throw new NotFoundException('Outbox event not found for hospital');
    }
    if (row.status === DomainEventOutboxStatus.PROCESSED) {
      return row;
    }
    throw new NotFoundException('Outbox event not pending for hospital');
  }
}
