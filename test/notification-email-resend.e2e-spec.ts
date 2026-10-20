import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  DomainEventOutboxStatus,
  NotificationStatus,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditModule } from '../src/audit/audit.module';
import { AuthModule } from '../src/auth/auth.module';
import { CommonModule } from '../src/common/common.module';
import { JobModule } from '../src/jobs/job.module';
import { JOB_TYPES } from '../src/jobs/job-types.constants';
import { ResendEmailProviderAdapter } from '../src/notifications/channels/resend-email.provider';
import { NOTIFICATION_CHANNEL_EMAIL } from '../src/notifications/notification.constants';
import { NotificationsModule } from '../src/notifications/notifications.module';
import {
  authorizationHeader,
  StaffHttpAuthUser,
} from './support/staff-auth-http.util';
import {
  collectIsolatedDatabaseEvidence,
  IsolatedDatabaseEvidence,
} from './support/isolated-test-database.util';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    JobModule,
    AuditModule,
    AuthModule,
    NotificationsModule,
  ],
})
class NotificationEmailResendHttpE2eModule {}

describe('POST /notifications/:id/resend-email (HTTP e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let dbEvidence: IsolatedDatabaseEvidence | null = null;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdJobIds: string[] = [];
  const createdNotificationIds: string[] = [];
  const createdOutboxIds: string[] = [];
  const createdAuditLogIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdHospitalIds: string[] = [];

  let hospitalId: string;
  let deniedRoleId: string;
  let allowedRoleId: string;
  let deniedUserId: string;
  let allowedUserId: string;

  const deniedActor = (): StaffHttpAuthUser => ({
    sub: deniedUserId,
    hospitalId,
    branchId: null,
    roleId: deniedRoleId,
    role: 'DENIED',
  });

  const allowedActor = (): StaffHttpAuthUser => ({
    sub: allowedUserId,
    hospitalId,
    branchId: null,
    roleId: allowedRoleId,
    role: 'DELIVERY',
  });

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      return;
    }

    dbEvidence = await collectIsolatedDatabaseEvidence(databaseUrl);
    if (!dbEvidence.isolated) {
      return;
    }

    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    await prisma.$connect();

    const hospital = await prisma.hospital.create({
      data: {
        name: `HTTP resend ${runId}`,
        code: `NERH-${runId}`,
      },
    });
    hospitalId = hospital.id;
    createdHospitalIds.push(hospital.id);

    deniedRoleId = (
      await prisma.role.create({
        data: {
          hospitalId,
          name: `ResendDenied-${runId}`,
          description: 'no delivery permission',
        },
      })
    ).id;
    createdRoleIds.push(deniedRoleId);

    allowedRoleId = (
      await prisma.role.create({
        data: {
          hospitalId,
          name: `ResendAllowed-${runId}`,
          description: 'delivery permission',
        },
      })
    ).id;
    createdRoleIds.push(allowedRoleId);

    await prisma.permission.upsert({
      where: { name: 'notifications:delivery:manage' },
      update: {
        description: 'Manage notification delivery retries and resends',
      },
      create: {
        name: 'notifications:delivery:manage',
        description: 'Manage notification delivery retries and resends',
      },
    });

    await grant(allowedRoleId, 'notifications:delivery:manage');

    deniedUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          roleId: deniedRoleId,
          name: 'Denied resend user',
          email: `resend-denied-${runId}@example.com`,
          passwordHash: 'hash',
        },
      })
    ).id;
    createdUserIds.push(deniedUserId);

    allowedUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          roleId: allowedRoleId,
          name: 'Allowed resend user',
          email: `resend-allowed-${runId}@example.com`,
          passwordHash: 'hash',
        },
      })
    ).id;
    createdUserIds.push(allowedUserId);

    const resendProviderSend = jest.fn().mockResolvedValue({
      ok: true,
      providerMessageId: 'mock-resend-message-id',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [NotificationEmailResendHttpE2eModule],
    })
      .overrideProvider(ResendEmailProviderAdapter)
      .useValue({ send: resendProviderSend })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (!dbEvidence?.isolated || !prisma) {
      return;
    }
    try {
      if (createdAuditLogIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { id: { in: createdAuditLogIds } },
        });
      }
      if (createdJobIds.length > 0) {
        await prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
      }
      if (createdNotificationIds.length > 0) {
        await prisma.notification.deleteMany({
          where: { id: { in: createdNotificationIds } },
        });
      }
      if (createdOutboxIds.length > 0) {
        await prisma.domainEventOutbox.deleteMany({
          where: { id: { in: createdOutboxIds } },
        });
      }
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      if (createdRoleIds.length > 0) {
        await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      }
      if (createdHospitalIds.length > 0) {
        await prisma.hospital.deleteMany({
          where: { id: { in: createdHospitalIds } },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function grant(roleId: string, permissionName: string) {
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { name: permissionName },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId, permissionId: permission.id },
      },
      update: {},
      create: { roleId, permissionId: permission.id },
    });
  }

  async function createFailedEmailNotification(suffix: string) {
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId,
        eventType: 'email.resend.http',
        entityType: 'Test',
        entityId: `ent-http-${runId}-${suffix}`,
        idempotencyKey: `email-resend-http-outbox:${runId}:${suffix}`,
        payload: { channel: NOTIFICATION_CHANNEL_EMAIL, to: 'test@example.com' },
        status: DomainEventOutboxStatus.PROCESSED,
      },
    });
    createdOutboxIds.push(outbox.id);

    const notification = await prisma.notification.create({
      data: {
        hospitalId,
        outboxId: outbox.id,
        category: 'transactional',
        channel: NOTIFICATION_CHANNEL_EMAIL,
        templateKey: 'test.email',
        payload: { to: 'test@example.com' },
        status: NotificationStatus.FAILED,
        idempotencyKey: `email-resend-http-notif:${runId}:${suffix}`,
        lastError: 'provider_timeout',
        failedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    createdNotificationIds.push(notification.id);

    return { notification, outbox };
  }

  const itWithIsolatedDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbEvidence?.isolated) {
        pending(
          dbEvidence?.reason ??
            'HTTP integration writes require isolated medios_test database',
        );
        return;
      }
      await fn();
    });
  };

  it('documents database isolation evidence for this suite', () => {
    expect(dbEvidence).not.toBeNull();
    if (!dbEvidence?.isolated) {
      pending(dbEvidence?.reason ?? 'isolated database not verified');
      return;
    }
    expect(dbEvidence.activeDatabaseName).toBe('medios_test');
    expect(dbEvidence.configuredDatabaseName).toBe('medios_test');
  });

  itWithIsolatedDb('rejects unauthenticated requests with 401', async () => {
    const { notification } = await createFailedEmailNotification('unauth');

    await request(app.getHttpServer())
      .post(`/notifications/${notification.id}/resend-email`)
      .expect(401);
  });

  itWithIsolatedDb(
    'returns 403 when the user lacks notifications:delivery:manage',
    async () => {
      const { notification } = await createFailedEmailNotification('forbidden');

      await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/resend-email`)
        .set(authorizationHeader(deniedActor()))
        .expect(403)
        .expect((response) => {
          expect(response.body.message).toBe('Insufficient permissions');
        });
    },
  );

  itWithIsolatedDb(
    'queues resend for an eligible FAILED email notification',
    async () => {
      const { notification, outbox } = await createFailedEmailNotification(
        'success',
      );

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/resend-email`)
        .set(authorizationHeader(allowedActor()))
        .expect(201);

      expect(response.body).toEqual({
        notificationId: notification.id,
        jobId: expect.any(String),
        status: 'queued',
      });

      const notificationAfter = await prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      expect(notificationAfter.status).toBe(NotificationStatus.PENDING);
      expect(notificationAfter.lastError).toBeNull();
      expect(notificationAfter.failedAt).toBeNull();

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: response.body.jobId },
      });
      createdJobIds.push(job.id);
      expect(job.type).toBe(JOB_TYPES.NOTIFICATION_DISPATCH);
      expect(job.payload).toEqual({ outboxId: outbox.id });

      const auditRow = await prisma.auditLog.findFirst({
        where: {
          hospitalId,
          action: 'NOTIFICATION_EMAIL_RESEND_REQUESTED',
          entityId: notification.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditRow).not.toBeNull();
      createdAuditLogIds.push(auditRow!.id);
    },
  );

  itWithIsolatedDb('returns 409 for non-failed notifications', async () => {
    const { notification } = await createFailedEmailNotification('pending');
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: NotificationStatus.PENDING, lastError: null, failedAt: null },
    });

    await request(app.getHttpServer())
      .post(`/notifications/${notification.id}/resend-email`)
      .set(authorizationHeader(allowedActor()))
      .expect(409);
  });

  itWithIsolatedDb('returns 400 for non-email channel notifications', async () => {
    const { notification } = await createFailedEmailNotification('whatsapp');
    await prisma.notification.update({
      where: { id: notification.id },
      data: { channel: 'whatsapp' },
    });

    await request(app.getHttpServer())
      .post(`/notifications/${notification.id}/resend-email`)
      .set(authorizationHeader(allowedActor()))
      .expect(400);
  });

  itWithIsolatedDb('returns 404 for unknown notification ids', async () => {
    await request(app.getHttpServer())
      .post(`/notifications/${randomUUID()}/resend-email`)
      .set(authorizationHeader(allowedActor()))
      .expect(404);
  });
});
