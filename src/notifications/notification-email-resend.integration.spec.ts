import {
  DomainEventOutboxStatus,
  NotificationStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuditService } from '../audit/audit.service';
import {
  PERMISSIONS_KEY,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { NotificationEmailResendService } from './notification-email-resend.service';
import { NOTIFICATION_CHANNEL_EMAIL } from './notification.constants';

class ResendEmailPermissionProbes {
  @RequirePermissions('notifications:delivery:manage')
  resendEmail() {}
}

describe('NotificationEmailResendController permission metadata', () => {
  const controllerPath = join(
    __dirname,
    'notification-email-resend.controller.ts',
  );

  it('wires JWT and PermissionsGuard on NotificationEmailResendController', () => {
    const source = readFileSync(controllerPath, 'utf8');
    expect(source).toContain('@UseGuards(JwtAuthGuard, PermissionsGuard)');
    expect(source).toContain("@Controller('notifications')");
  });

  it('requires notifications:delivery:manage on POST :id/resend-email', () => {
    const source = readFileSync(controllerPath, 'utf8');
    expect(source).toMatch(
      /@Post\(':id\/resend-email'\)[\s\S]*@RequirePermissions\('notifications:delivery:manage'\)[\s\S]*resendEmail/,
    );
  });

  it('matches controller handler metadata for notifications:delivery:manage', () => {
    const source = readFileSync(controllerPath, 'utf8');
    expect(source).toContain("@RequirePermissions('notifications:delivery:manage')");

    const reflector = new Reflector();
    const handler = ResendEmailPermissionProbes.prototype.resendEmail;
    const required = reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      handler,
      ResendEmailPermissionProbes,
    ]);
    expect(required).toEqual(['notifications:delivery:manage']);
  });
});

describe('Notification email resend integration', () => {
  const prisma = new PrismaClient();
  const jobService = new JobService(prisma as never);
  const auditService = new AuditService(prisma as never);
  const resendService = new NotificationEmailResendService(
    prisma as never,
    jobService,
    auditService,
  );

  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdJobIds: string[] = [];
  const createdNotificationIds: string[] = [];
  const createdOutboxIds: string[] = [];
  const createdAuditLogIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdHospitalIds: string[] = [];

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

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  async function createHospital(suffix: string) {
    const hospital = await prisma.hospital.create({
      data: {
        name: `Email resend ${suffix}`,
        code: `NER-${runId}-${suffix}`,
      },
    });
    createdHospitalIds.push(hospital.id);
    return hospital;
  }

  async function createRole(hospitalId: string, suffix: string) {
    const role = await prisma.role.create({
      data: {
        hospitalId,
        name: `ResendRole-${runId}-${suffix}`,
        description: 'resend test role',
      },
    });
    createdRoleIds.push(role.id);
    return role;
  }

  async function createUser(hospitalId: string, roleId: string, suffix: string) {
    const user = await prisma.user.create({
      data: {
        hospitalId,
        roleId,
        name: `Resend user ${suffix}`,
        email: `resend-${runId}-${suffix}@example.com`,
        passwordHash: 'hash',
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

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

  async function createFailedEmailNotification(hospitalId: string, suffix: string) {
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId,
        eventType: 'email.resend.test',
        entityType: 'Test',
        entityId: `ent-${runId}-${suffix}`,
        idempotencyKey: `email-resend-outbox:${runId}:${suffix}`,
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
        idempotencyKey: `email-resend-notif:${runId}:${suffix}`,
        lastError: 'provider_timeout',
        failedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    createdNotificationIds.push(notification.id);

    return { notification, outbox };
  }

  function resendActor(userId: string, hospitalId: string) {
    return {
      sub: userId,
      hospitalId,
      branchId: null as string | null,
    };
  }

  itWithDb(
    'resend moves FAILED email notification to PENDING, enqueues dispatch job, and audits',
    async () => {
      const hospital = await createHospital('success');
      const role = await createRole(hospital.id, 'success');
      const user = await createUser(hospital.id, role.id, 'success');
      const { notification, outbox } = await createFailedEmailNotification(
        hospital.id,
        'success',
      );

      const result = await resendService.resendFailedEmail(
        resendActor(user.id, hospital.id),
        notification.id,
      );

      expect(result).toEqual({
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
      expect(notificationAfter.outboxId).toBe(outbox.id);

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: result.jobId },
      });
      createdJobIds.push(job.id);
      expect(job.hospitalId).toBe(hospital.id);
      expect(job.type).toBe(JOB_TYPES.NOTIFICATION_DISPATCH);
      expect(job.payload).toEqual({ outboxId: outbox.id });
      expect(job.idempotencyKey).toMatch(
        new RegExp(
          `^notification\\.dispatch:resend:${notification.id}:[0-9a-f-]{36}$`,
        ),
      );

      const auditRow = await prisma.auditLog.findFirst({
        where: {
          hospitalId: hospital.id,
          action: 'NOTIFICATION_EMAIL_RESEND_REQUESTED',
          entityId: notification.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditRow).not.toBeNull();
      createdAuditLogIds.push(auditRow!.id);
      expect(auditRow!.userId).toBe(user.id);
      expect(auditRow!.metadata).toEqual({
        jobId: job.id,
        outboxId: outbox.id,
      });
    },
  );

  itWithDb(
    'rolls back when job enqueue fails inside the resend transaction',
    async () => {
      const hospital = await createHospital('enqueue-fail');
      const role = await createRole(hospital.id, 'enqueue-fail');
      const user = await createUser(hospital.id, role.id, 'enqueue-fail');
      const { notification } = await createFailedEmailNotification(
        hospital.id,
        'enqueue-fail',
      );

      const failingJobService = new JobService(prisma as never);
      const realEnqueue = failingJobService.enqueueWithClient.bind(
        failingJobService,
      );
      const enqueueSpy = jest
        .spyOn(failingJobService, 'enqueueWithClient')
        .mockImplementationOnce((client, input) =>
          realEnqueue(client, {
            ...input,
            hospitalId: '00000000-0000-4000-8000-000000000000',
          }),
        );

      const failingResendService = new NotificationEmailResendService(
        prisma as never,
        failingJobService,
        auditService,
      );

      const jobsBefore = await prisma.job.count({
        where: {
          hospitalId: hospital.id,
          type: JOB_TYPES.NOTIFICATION_DISPATCH,
          idempotencyKey: { startsWith: `notification.dispatch:resend:${notification.id}:` },
        },
      });
      const auditsBefore = await prisma.auditLog.count({
        where: {
          hospitalId: hospital.id,
          action: 'NOTIFICATION_EMAIL_RESEND_REQUESTED',
          entityId: notification.id,
        },
      });

      try {
        await expect(
          failingResendService.resendFailedEmail(
            resendActor(user.id, hospital.id),
            notification.id,
          ),
        ).rejects.toMatchObject({
          code: 'P2003',
        } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
      } finally {
        enqueueSpy.mockRestore();
      }

      const notificationAfter = await prisma.notification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      expect(notificationAfter.status).toBe(NotificationStatus.FAILED);
      expect(notificationAfter.lastError).toBe('provider_timeout');
      expect(notificationAfter.failedAt).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );

      const jobsAfter = await prisma.job.count({
        where: {
          hospitalId: hospital.id,
          type: JOB_TYPES.NOTIFICATION_DISPATCH,
          idempotencyKey: { startsWith: `notification.dispatch:resend:${notification.id}:` },
        },
      });
      expect(jobsAfter).toBe(jobsBefore);

      const auditsAfter = await prisma.auditLog.count({
        where: {
          hospitalId: hospital.id,
          action: 'NOTIFICATION_EMAIL_RESEND_REQUESTED',
          entityId: notification.id,
        },
      });
      expect(auditsAfter).toBe(auditsBefore);
    },
  );

  itWithDb(
    'PermissionsGuard allows notifications:delivery:manage and denies without it',
    async () => {
      const hospital = await createHospital('rbac');
      const allowedRole = await createRole(hospital.id, 'rbac-allowed');
      const deniedRole = await createRole(hospital.id, 'rbac-denied');
      const allowedUser = await createUser(
        hospital.id,
        allowedRole.id,
        'rbac-allowed',
      );
      await createUser(hospital.id, deniedRole.id, 'rbac-denied');

      await grant(allowedRole.id, 'notifications:delivery:manage');

      const reflector = new Reflector();
      const guard = new PermissionsGuard(reflector, prisma as never);
      const handler = ResendEmailPermissionProbes.prototype.resendEmail;

      const required = reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        handler,
        ResendEmailPermissionProbes,
      ]);
      expect(required).toEqual(['notifications:delivery:manage']);

      const allowedCtx = {
        getHandler: () => handler,
        getClass: () => ResendEmailPermissionProbes,
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              roleId: allowedRole.id,
              hospitalId: hospital.id,
              sub: allowedUser.id,
            },
          }),
        }),
      };

      const deniedCtx = {
        ...allowedCtx,
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              roleId: deniedRole.id,
              hospitalId: hospital.id,
            },
          }),
        }),
      };

      await expect(guard.canActivate(deniedCtx as never)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(allowedCtx as never)).resolves.toBe(true);
    },
  );
});
