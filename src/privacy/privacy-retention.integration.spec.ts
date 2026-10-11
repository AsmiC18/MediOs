import {
  NotificationStatus,
  PrismaClient,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrivacyRetentionService } from './privacy-retention.service';

describe('PrivacyRetentionService (PostgreSQL integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdHospitalIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdAuditIds: string[] = [];
  const createdNotificationIds: string[] = [];
  const createdConversationIds: string[] = [];
  const createdWhatsAppMessageIds: string[] = [];

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    if (createdWhatsAppMessageIds.length > 0) {
      await prisma.whatsAppMessage.deleteMany({
        where: { id: { in: createdWhatsAppMessageIds } },
      });
    }
    if (createdConversationIds.length > 0) {
      await prisma.whatsAppConversation.deleteMany({
        where: { id: { in: createdConversationIds } },
      });
    }
    if (createdNotificationIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: createdNotificationIds } },
      });
    }
    if (createdAuditIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    }
    if (createdPatientIds.length > 0) {
      await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    }
    if (createdHospitalIds.length > 0) {
      await prisma.hospital.deleteMany({ where: { id: { in: createdHospitalIds } } });
    }
    await prisma.$disconnect();
  });

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  itWithDb('purges only rows older than retention cutoff', async () => {
    const originalEnv = { ...process.env };
    process.env.PRIVACY_RETENTION_ENABLED = 'true';
    process.env.PRIVACY_RETENTION_AUDIT_LOG_DAYS = '30';
    process.env.PRIVACY_RETENTION_NOTIFICATION_DAYS = '30';
    process.env.PRIVACY_RETENTION_WHATSAPP_MESSAGE_DAYS = '30';
    process.env.PRIVACY_RETENTION_BATCH_SIZE = '50';

    const hospital = await prisma.hospital.create({
      data: { name: `Retention ${runId}`, code: `RET-${runId}` },
    });
    createdHospitalIds.push(hospital.id);

    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospital.id,
        phone: `8${runId.replace(/\D/g, '').slice(0, 9)}`.slice(0, 15),
        firstName: 'Retention',
      },
    });
    createdPatientIds.push(patient.id);

    const oldDate = new Date('2020-01-01T00:00:00Z');
    const recentDate = new Date();

    const oldAudit = await prisma.auditLog.create({
      data: {
        hospitalId: hospital.id,
        action: 'TEST_OLD',
        entity: 'Test',
        createdAt: oldDate,
      },
    });
    createdAuditIds.push(oldAudit.id);

    const recentAudit = await prisma.auditLog.create({
      data: {
        hospitalId: hospital.id,
        action: 'TEST_RECENT',
        entity: 'Test',
        createdAt: recentDate,
      },
    });
    createdAuditIds.push(recentAudit.id);

    const oldNotification = await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        category: 'test',
        channel: 'whatsapp',
        payload: { ok: true },
        status: NotificationStatus.DISPATCHED,
        idempotencyKey: `ret-old-${runId}`,
        createdAt: oldDate,
      },
    });
    createdNotificationIds.push(oldNotification.id);

    const recentNotification = await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        category: 'test',
        channel: 'whatsapp',
        payload: { ok: true },
        status: NotificationStatus.DISPATCHED,
        idempotencyKey: `ret-new-${runId}`,
        createdAt: recentDate,
      },
    });
    createdNotificationIds.push(recentNotification.id);

    const conversation = await prisma.whatsAppConversation.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
      },
    });
    createdConversationIds.push(conversation.id);

    const oldMessage = await prisma.whatsAppMessage.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        conversationId: conversation.id,
        direction: WhatsAppMessageDirection.OUTBOUND,
        messageType: WhatsAppMessageType.TEMPLATE,
        status: WhatsAppMessageStatus.SENT,
        createdAt: oldDate,
      },
    });
    createdWhatsAppMessageIds.push(oldMessage.id);

    const auditService = new AuditService(prisma as never);
    const service = new PrivacyRetentionService(prisma as never, auditService);

    const now = new Date('2026-06-01T00:00:00Z');
    await service.purgeForHospital(hospital.id, { now, jobId: 'job-retention-test' });

    const remainingAudit = await prisma.auditLog.findMany({
      where: { hospitalId: hospital.id },
      select: { id: true, action: true },
    });
    expect(remainingAudit.some((row) => row.id === recentAudit.id)).toBe(true);
    expect(remainingAudit.some((row) => row.id === oldAudit.id)).toBe(false);

    const remainingNotifications = await prisma.notification.findMany({
      where: { hospitalId: hospital.id },
      select: { id: true },
    });
    expect(remainingNotifications.some((row) => row.id === recentNotification.id)).toBe(
      true,
    );
    expect(remainingNotifications.some((row) => row.id === oldNotification.id)).toBe(
      false,
    );

    const remainingMessages = await prisma.whatsAppMessage.findMany({
      where: { hospitalId: hospital.id },
      select: { id: true },
    });
    expect(remainingMessages.some((row) => row.id === oldMessage.id)).toBe(false);

    expect(remainingAudit.some((row) => row.action === 'PRIVACY_RETENTION_PURGE_COMPLETED')).toBe(
      true,
    );

    process.env = originalEnv;
  });
});
