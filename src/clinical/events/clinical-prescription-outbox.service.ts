import { Injectable } from '@nestjs/common';
import { PrescriptionStatus, Prisma } from '@prisma/client';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import {
  buildClinicalPrescriptionCreatedDomainEvent,
  buildClinicalPrescriptionStatusChangedDomainEvent,
  CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
  PrescriptionForClinicalEvent,
  shouldEnqueuePharmacyPrescriptionProcess,
} from './clinical-prescription-event.util';

@Injectable()
export class ClinicalPrescriptionOutboxService {
  constructor(
    private readonly domainEventOutboxService: DomainEventOutboxService,
  ) {}

  async emitPrescriptionCreatedInTransaction(
    client: Prisma.TransactionClient,
    input: {
      prescription: PrescriptionForClinicalEvent;
      actorUserId: string;
      occurredAt?: Date;
    },
  ): Promise<void> {
    const occurredAt = input.occurredAt ?? new Date();
    const event = buildClinicalPrescriptionCreatedDomainEvent({
      prescription: input.prescription,
      actorUserId: input.actorUserId,
      occurredAt,
    });

    const outbox = await this.domainEventOutboxService.createInTransaction(
      client,
      event,
    );

    if (event.eventType === CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE) {
      await this.domainEventOutboxService.enqueueDispatchInTransaction(client, {
        hospitalId: input.prescription.hospitalId,
        branchId: input.prescription.branchId ?? null,
        outboxId: outbox.id,
      });
    }

    if (shouldEnqueuePharmacyPrescriptionProcess(event.eventType)) {
      await this.domainEventOutboxService.enqueuePharmacyPrescriptionProcessInTransaction(
        client,
        {
          hospitalId: input.prescription.hospitalId,
          branchId: input.prescription.branchId ?? null,
          outboxId: outbox.id,
        },
      );
    }
  }

  async emitPrescriptionStatusChangedInTransaction(
    client: Prisma.TransactionClient,
    input: {
      prescription: PrescriptionForClinicalEvent;
      actorUserId: string;
      previousStatus: PrescriptionStatus;
      newStatus: PrescriptionStatus;
      occurredAt?: Date;
    },
  ): Promise<void> {
    const occurredAt = input.occurredAt ?? new Date();
    const event = buildClinicalPrescriptionStatusChangedDomainEvent({
      prescription: input.prescription,
      actorUserId: input.actorUserId,
      occurredAt,
      previousStatus: input.previousStatus,
      newStatus: input.newStatus,
    });

    const outbox = await this.domainEventOutboxService.createInTransaction(
      client,
      event,
    );

    if (shouldEnqueuePharmacyPrescriptionProcess(event.eventType)) {
      await this.domainEventOutboxService.enqueuePharmacyPrescriptionProcessInTransaction(
        client,
        {
          hospitalId: input.prescription.hospitalId,
          branchId: input.prescription.branchId ?? null,
          outboxId: outbox.id,
        },
      );
    }
  }
}
