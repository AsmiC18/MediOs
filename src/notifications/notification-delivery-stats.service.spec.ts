import {
  DomainEventOutboxStatus,
  JobStatus,
  NotificationStatus,
} from '@prisma/client';
import {
  deriveInternalDeliveryStatus,
  deriveOutboxQueueStatus,
  NotificationDeliveryStatsService,
} from './notification-delivery-stats.service';

describe('NotificationDeliveryStatsService', () => {
  describe('deriveInternalDeliveryStatus', () => {
    it('maps dispatched notifications to sent', () => {
      expect(
        deriveInternalDeliveryStatus(
          { status: NotificationStatus.DISPATCHED, lastError: null },
          undefined,
        ),
      ).toBe('sent');
    });

    it('maps pending without job to queued', () => {
      expect(
        deriveInternalDeliveryStatus(
          { status: NotificationStatus.PENDING, lastError: null },
          undefined,
        ),
      ).toBe('queued');
    });

    it('maps running job to processing', () => {
      expect(
        deriveInternalDeliveryStatus(
          { status: NotificationStatus.PENDING, lastError: null },
          { status: JobStatus.RUNNING, attempts: 1 },
        ),
      ).toBe('processing');
    });
  });

  describe('deriveOutboxQueueStatus', () => {
    it('maps pending outbox without notification to queued', () => {
      expect(
        deriveOutboxQueueStatus(DomainEventOutboxStatus.PENDING),
      ).toBe('queued');
    });
  });

  describe('getStats', () => {
    it('aggregates counts with tenant scope', async () => {
      const auditService = { log: jest.fn().mockResolvedValue(undefined) };
      const prisma = {
        notification: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'n1',
              status: NotificationStatus.DISPATCHED,
              channel: 'whatsapp',
              outboxId: 'o1',
              lastError: null,
            },
            {
              id: 'n2',
              status: NotificationStatus.PENDING,
              channel: 'email',
              outboxId: null,
              lastError: null,
            },
          ]),
        },
        domainEventOutbox: {
          findMany: jest.fn().mockResolvedValue([
            {
              status: DomainEventOutboxStatus.PENDING,
              payload: { channel: 'whatsapp' },
            },
          ]),
        },
        job: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new NotificationDeliveryStatsService(
        prisma as never,
        auditService as never,
      );

      const result = await service.getStats(
        { sub: 'u1', hospitalId: 'h1', branchId: null },
        {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-02-01T00:00:00.000Z',
        },
      );

      expect(result.totals.sent).toBe(1);
      expect(result.totals.queued).toBe(2);
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ hospitalId: 'h1' }),
        }),
      );
    });
  });
});
