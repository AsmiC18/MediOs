import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { NotificationEmailResendService } from './notification-email-resend.service';
import { NOTIFICATION_CHANNEL_EMAIL } from './notification.constants';

describe('NotificationEmailResendService', () => {
  const hospitalId = 'hospital-1';
  const branchId = 'branch-1';
  const notificationId = 'notification-1';
  const outboxId = 'outbox-1';
  const user = { sub: 'user-1', hospitalId, branchId: null as string | null };

  function buildFailedEmailNotification(overrides: Record<string, unknown> = {}) {
    return {
      id: notificationId,
      hospitalId,
      branchId: null,
      channel: NOTIFICATION_CHANNEL_EMAIL,
      status: NotificationStatus.FAILED,
      outboxId,
      lastError: 'resend_api_key_missing',
      ...overrides,
    };
  }

  function buildService(options: {
    notification?: ReturnType<typeof buildFailedEmailNotification> | null;
    updateCount?: number;
    enqueueError?: Error;
  }) {
    const notification =
      options.notification !== undefined
        ? options.notification
        : buildFailedEmailNotification();
    const updateCount = options.updateCount ?? 1;

    const transaction = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(notification),
        updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };

    const jobService = {
      enqueueWithClient: options.enqueueError
        ? jest.fn().mockRejectedValue(options.enqueueError)
        : jest.fn().mockResolvedValue({ id: 'job-new-1' }),
    };

    const auditService = {
      logInTransaction: jest.fn().mockResolvedValue(undefined),
    };

    const service = new NotificationEmailResendService(
      prisma as never,
      jobService as never,
      auditService as never,
    );

    return {
      service,
      prisma,
      transaction,
      jobService,
      auditService,
    };
  }

  it('queues resend for a failed email notification', async () => {
    const { service, jobService, auditService } = buildService({});

    const result = await service.resendFailedEmail(user, notificationId);

    expect(result).toEqual({
      notificationId,
      jobId: 'job-new-1',
      status: 'queued',
    });
    expect(jobService.enqueueWithClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        hospitalId,
        type: 'notification.dispatch',
        payload: { outboxId },
        maxAttempts: 5,
        idempotencyKey: expect.stringMatching(
          /^notification\.dispatch:resend:notification-1:[0-9a-f-]{36}$/,
        ),
      }),
    );
    expect(auditService.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'NOTIFICATION_EMAIL_RESEND_REQUESTED',
        entityId: notificationId,
        metadata: { jobId: 'job-new-1', outboxId },
      }),
    );
  });

  it('rejects non-email notifications', async () => {
    const { service } = buildService({
      notification: buildFailedEmailNotification({ channel: 'whatsapp' }),
    });

    await expect(
      service.resendFailedEmail(user, notificationId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects notifications from another hospital', async () => {
    const { service } = buildService({ notification: null });

    await expect(
      service.resendFailedEmail(user, notificationId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes branch users to notifications in their branch', async () => {
    const { service, transaction } = buildService({
      notification: null,
    });

    await expect(
      service.resendFailedEmail(
        { sub: 'user-1', hospitalId, branchId: branchId },
        notificationId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(transaction.notification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hospitalId,
          branchId,
        }),
      }),
    );
    expect(transaction.notification.updateMany).not.toHaveBeenCalled();
  });

  it('rejects non-failed status', async () => {
    const { service } = buildService({
      notification: buildFailedEmailNotification({
        status: NotificationStatus.DISPATCHED,
      }),
    });

    await expect(
      service.resendFailedEmail(user, notificationId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects missing outboxId', async () => {
    const { service } = buildService({
      notification: buildFailedEmailNotification({ outboxId: null }),
    });

    await expect(
      service.resendFailedEmail(user, notificationId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rolls back when job enqueue fails', async () => {
    const { service, prisma } = buildService({
      enqueueError: new Error('enqueue failed'),
    });

    await expect(
      service.resendFailedEmail(user, notificationId),
    ).rejects.toThrow('enqueue failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects concurrent resend when status is no longer failed', async () => {
    const { service } = buildService({ updateCount: 0 });

    await expect(
      service.resendFailedEmail(user, notificationId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects repeated resend after first attempt moved notification to pending', async () => {
    const pendingNotification = buildFailedEmailNotification({
      status: NotificationStatus.PENDING,
    });
    const { service } = buildService({ notification: pendingNotification });

    await expect(
      service.resendFailedEmail(user, notificationId),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
