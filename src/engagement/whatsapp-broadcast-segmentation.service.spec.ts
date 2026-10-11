import {
  PatientPrivacyConsentStatus,
  PatientPrivacyPurpose,
} from '@prisma/client';
import { WhatsappBroadcastSegmentationService } from './whatsapp-broadcast-segmentation.service';

describe('WhatsappBroadcastSegmentationService', () => {
  it('skips opt-out and consent-blocked patients when handing off winback', async () => {
    const outbox = {
      createInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      enqueueDispatchInTransaction: jest.fn().mockResolvedValue(undefined),
    };
    const prefs = {
      isWhatsAppTransactionalEnabled: jest
        .fn()
        .mockImplementation(async (_h, patientId: string) => patientId !== 'p-optout'),
    };
    const tx = {
      patient: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
          anonymizedAt: null,
          mergedIntoPatientId: null,
        })),
      },
      patientPrivacyConsent: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          if (where.patientId === 'p-noconsent') {
            return null;
          }
          if (where.status === PatientPrivacyConsentStatus.WITHDRAWN) {
            return null;
          }
          if (
            where.purpose === PatientPrivacyPurpose.COMMUNICATION &&
            where.status === PatientPrivacyConsentStatus.GRANTED
          ) {
            return {
              id: 'c1',
              createdAt: new Date('2026-01-01'),
            };
          }
          return null;
        }),
      },
    };

    const service = new WhatsappBroadcastSegmentationService(
      outbox as never,
      prefs as never,
    );

    const result = await service.handoffWinbackRecipientsInTransaction(
      tx as never,
      {
        campaignId: 'camp-1',
        hospitalId: 'h1',
        branchId: 'b1',
        patientIds: ['p-optout', 'p-noconsent', 'p-consent'],
      },
    );

    expect(result.skippedOptOutCount).toBe(1);
    expect(result.skippedConsentCount).toBe(1);
    expect(result.enqueuedCount).toBe(1);
    expect(result.eligiblePatientIds).toEqual(['p-consent']);
    expect(outbox.createInTransaction).toHaveBeenCalledTimes(1);
  });
});
