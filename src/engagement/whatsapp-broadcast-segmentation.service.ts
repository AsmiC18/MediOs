import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';
import { buildPatientWinbackRequestedDomainEvent } from './patient-winback-event.util';
import { isPatientEligibleForTransactionalCommunication } from './patient-communication-eligibility.util';

export type WinbackBroadcastHandoffInput = {
  campaignId: string;
  hospitalId: string;
  branchId?: string | null;
  patientIds: string[];
};

export type WinbackBroadcastHandoffResult = {
  eligiblePatientIds: string[];
  skippedOptOutCount: number;
  skippedConsentCount: number;
  enqueuedCount: number;
};

/**
 * Segments eligible win-back recipients and hands off to the existing
 * domain-event + notification.dispatch pipeline (no direct Meta/WhatsApp calls).
 */
@Injectable()
export class WhatsappBroadcastSegmentationService {
  constructor(
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly patientNotificationPreferenceService: PatientNotificationPreferenceService,
  ) {}

  async handoffWinbackRecipientsInTransaction(
    tx: Prisma.TransactionClient,
    input: WinbackBroadcastHandoffInput,
  ): Promise<WinbackBroadcastHandoffResult> {
    const eligiblePatientIds: string[] = [];
    let skippedOptOutCount = 0;
    let skippedConsentCount = 0;
    let enqueuedCount = 0;

    for (const patientId of input.patientIds) {
      const whatsappEnabled =
        await this.patientNotificationPreferenceService.isWhatsAppTransactionalEnabled(
          input.hospitalId,
          patientId,
        );
      if (!whatsappEnabled) {
        skippedOptOutCount += 1;
        continue;
      }

      const consentOk = await isPatientEligibleForTransactionalCommunication(
        tx,
        { hospitalId: input.hospitalId, patientId },
      );
      if (!consentOk) {
        skippedConsentCount += 1;
        continue;
      }

      eligiblePatientIds.push(patientId);

      const outbox = await this.domainEventOutboxService.createInTransaction(
        tx,
        buildPatientWinbackRequestedDomainEvent({
          campaignId: input.campaignId,
          patientId,
          hospitalId: input.hospitalId,
          branchId: input.branchId ?? null,
        }),
      );

      await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: input.hospitalId,
        branchId: input.branchId ?? null,
        outboxId: outbox.id,
      });
      enqueuedCount += 1;
    }

    return {
      eligiblePatientIds,
      skippedOptOutCount,
      skippedConsentCount,
      enqueuedCount,
    };
  }
}
