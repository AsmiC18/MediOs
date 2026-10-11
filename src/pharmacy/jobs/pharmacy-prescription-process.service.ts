import { Injectable } from '@nestjs/common';
import {
  DomainEventOutbox,
  PharmacyPrescriptionWorkItemStatus,
  PrescriptionStatus,
} from '@prisma/client';
import {
  CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
  CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE,
  ClinicalPrescriptionEventSnapshot,
} from '../../clinical/events/clinical-prescription-event.util';
import { JobPermanentFailureError } from '../../jobs/job-permanent-failure.error';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';

export type PharmacyPrescriptionProcessResult = {
  outcome: 'work_item_opened' | 'work_item_updated' | 'already_processed' | 'skipped';
  workItemId?: string;
};

function parsePrescriptionEventPayload(
  payload: unknown,
): ClinicalPrescriptionEventSnapshot | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (
    typeof record.prescriptionId !== 'string' ||
    typeof record.patientId !== 'string' ||
    typeof record.encounterId !== 'string'
  ) {
    return null;
  }
  return record as unknown as ClinicalPrescriptionEventSnapshot;
}

@Injectable()
export class PharmacyPrescriptionProcessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
  ) {}

  async processOutboxEvent(
    hospitalId: string,
    outboxId: string,
  ): Promise<PharmacyPrescriptionProcessResult> {
    const outbox = await this.domainEventOutboxService.findByIdForHospital(
      outboxId,
      hospitalId,
    );

    if (!outbox) {
      throw new JobPermanentFailureError(
        'Domain event outbox row not found for job hospital scope',
      );
    }

    if (
      outbox.eventType !== CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE &&
      outbox.eventType !== CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE
    ) {
      throw new JobPermanentFailureError(
        `Unsupported pharmacy prescription event type: ${outbox.eventType}`,
      );
    }

    const snapshot = parsePrescriptionEventPayload(outbox.payload);
    if (!snapshot) {
      throw new JobPermanentFailureError(
        'Prescription outbox payload is missing required identifiers',
      );
    }

    if (snapshot.hospitalId !== hospitalId) {
      throw new JobPermanentFailureError(
        'Prescription event hospitalId does not match job hospital scope',
      );
    }

    if (outbox.entityId !== snapshot.prescriptionId) {
      throw new JobPermanentFailureError(
        'Prescription event entityId does not match payload prescriptionId',
      );
    }

    const prescription = await this.prisma.prescription.findFirst({
      where: {
        id: snapshot.prescriptionId,
        hospitalId,
      },
      include: { encounter: true },
    });

    if (!prescription) {
      throw new JobPermanentFailureError(
        'Prescription not found for pharmacy handoff event',
      );
    }

    if (prescription.patientId !== snapshot.patientId) {
      throw new JobPermanentFailureError(
        'Prescription patient does not match event payload',
      );
    }

    if (prescription.encounterId !== snapshot.encounterId) {
      throw new JobPermanentFailureError(
        'Prescription encounter does not match event payload',
      );
    }

    return this.applyWorkItemFromEvent(outbox, prescription.encounter.branchId);
  }

  private async applyWorkItemFromEvent(
    outbox: DomainEventOutbox,
    branchId: string | null,
  ): Promise<PharmacyPrescriptionProcessResult> {
    const snapshot = parsePrescriptionEventPayload(outbox.payload);
    if (!snapshot) {
      throw new JobPermanentFailureError('Invalid prescription event payload');
    }

    if (outbox.eventType === CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE) {
      if (snapshot.status !== PrescriptionStatus.ACTIVE) {
        return { outcome: 'skipped' };
      }

      const existing = await this.prisma.pharmacyPrescriptionWorkItem.findUnique(
        {
          where: { prescriptionId: snapshot.prescriptionId },
        },
      );

      if (existing) {
        if (existing.lastOutboxId === outbox.id) {
          return { outcome: 'already_processed', workItemId: existing.id };
        }
        return { outcome: 'already_processed', workItemId: existing.id };
      }

      const created = await this.prisma.pharmacyPrescriptionWorkItem.create({
        data: {
          hospitalId: outbox.hospitalId,
          branchId,
          prescriptionId: snapshot.prescriptionId,
          encounterId: snapshot.encounterId,
          patientId: snapshot.patientId,
          status: PharmacyPrescriptionWorkItemStatus.OPEN,
          lastOutboxId: outbox.id,
        },
      });

      return { outcome: 'work_item_opened', workItemId: created.id };
    }

    const targetStatus = this.workItemStatusForPrescriptionStatus(
      snapshot.newStatus ?? snapshot.status,
    );

    if (!targetStatus) {
      return { outcome: 'skipped' };
    }

    const workItem = await this.prisma.pharmacyPrescriptionWorkItem.findUnique({
      where: { prescriptionId: snapshot.prescriptionId },
    });

    if (!workItem) {
      if (targetStatus === PharmacyPrescriptionWorkItemStatus.OPEN) {
        const created = await this.prisma.pharmacyPrescriptionWorkItem.create({
          data: {
            hospitalId: outbox.hospitalId,
            branchId,
            prescriptionId: snapshot.prescriptionId,
            encounterId: snapshot.encounterId,
            patientId: snapshot.patientId,
            status: targetStatus,
            lastOutboxId: outbox.id,
          },
        });
        return { outcome: 'work_item_opened', workItemId: created.id };
      }
      return { outcome: 'skipped' };
    }

    if (workItem.hospitalId !== outbox.hospitalId) {
      throw new JobPermanentFailureError(
        'Work item hospital does not match event hospital',
      );
    }

    if (workItem.lastOutboxId === outbox.id) {
      return { outcome: 'already_processed', workItemId: workItem.id };
    }

    const updated = await this.prisma.pharmacyPrescriptionWorkItem.update({
      where: { id: workItem.id },
      data: {
        status: targetStatus,
        lastOutboxId: outbox.id,
      },
    });

    return { outcome: 'work_item_updated', workItemId: updated.id };
  }

  private workItemStatusForPrescriptionStatus(
    status: PrescriptionStatus,
  ): PharmacyPrescriptionWorkItemStatus | null {
    switch (status) {
      case PrescriptionStatus.ACTIVE:
        return PharmacyPrescriptionWorkItemStatus.OPEN;
      case PrescriptionStatus.CANCELLED:
        return PharmacyPrescriptionWorkItemStatus.CANCELLED;
      case PrescriptionStatus.COMPLETED:
        return PharmacyPrescriptionWorkItemStatus.COMPLETED;
      default:
        return null;
    }
  }
}
