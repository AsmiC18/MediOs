import { NotificationStatus, WhatsAppMessageStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PrivacyRetentionService } from './privacy-retention.service';

describe('PrivacyRetentionService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function buildService(prisma: {
    auditLog: { findMany: jest.Mock; deleteMany: jest.Mock };
    whatsAppMessage: { findMany: jest.Mock; deleteMany: jest.Mock };
    notification: { findMany: jest.Mock; deleteMany: jest.Mock };
  }) {
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new PrivacyRetentionService(
        prisma as unknown as PrismaService,
        auditService as unknown as AuditService,
      ),
      auditService,
    };
  }

  it('skips purge when retention is disabled', async () => {
    process.env.PRIVACY_RETENTION_ENABLED = 'false';
    const prisma = {
      auditLog: { findMany: jest.fn(), deleteMany: jest.fn() },
      whatsAppMessage: { findMany: jest.fn(), deleteMany: jest.fn() },
      notification: { findMany: jest.fn(), deleteMany: jest.fn() },
    };
    const { service } = buildService(prisma);

    const result = await service.purgeForHospital('hospital-1');

    expect(result.skipped).toBe(true);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('deletes bounded terminal notification and audit rows when enabled', async () => {
    process.env.PRIVACY_RETENTION_ENABLED = 'true';
    process.env.PRIVACY_RETENTION_BATCH_SIZE = '2';
    const prisma = {
      whatsAppMessage: {
        findMany: jest.fn().mockResolvedValue([{ id: 'w1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { service, auditService } = buildService(prisma);

    const result = await service.purgeForHospital('hospital-1', {
      now: new Date('2026-01-01T00:00:00Z'),
      jobId: 'job-1',
    });

    expect(result.skipped).toBe(false);
    expect(result.whatsAppMessagesDeleted).toBe(1);
    expect(result.notificationsDeleted).toBe(2);
    expect(result.auditLogsDeleted).toBe(1);

    expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hospitalId: 'hospital-1',
          status: {
            in: [
              WhatsAppMessageStatus.SENT,
              WhatsAppMessageStatus.DELIVERED,
              WhatsAppMessageStatus.READ,
              WhatsAppMessageStatus.FAILED,
            ],
          },
        }),
        take: 2,
      }),
    );

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              NotificationStatus.DISPATCHED,
              NotificationStatus.FAILED,
              NotificationStatus.CANCELLED,
              NotificationStatus.SKIPPED,
            ],
          },
        }),
      }),
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PRIVACY_RETENTION_PURGE_COMPLETED',
        metadata: expect.objectContaining({
          auditLogsDeleted: 1,
          whatsAppMessagesDeleted: 1,
          notificationsDeleted: 2,
        }),
      }),
    );
  });
});
