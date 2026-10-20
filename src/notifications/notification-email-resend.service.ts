import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import {
  assertBranchAccess,
  applyBranchScope,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { NOTIFICATION_CHANNEL_EMAIL } from './notification.constants';
import {
  NotificationEmailResendResponse,
  NotificationEmailResendUser,
} from './notification-email-resend.types';

@Injectable()
export class NotificationEmailResendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: JobService,
    private readonly auditService: AuditService,
  ) {}

  async resendFailedEmail(
    user: NotificationEmailResendUser,
    notificationId: string,
  ): Promise<NotificationEmailResendResponse> {
    return this.prisma.$transaction(async (transaction) => {
      const notification = await transaction.notification.findFirst({
        where: applyBranchScope(user, {
          id: notificationId,
          hospitalId: user.hospitalId,
        }),
      });

      if (!notification) {
        throw new NotFoundException('Notification not found');
      }

      assertBranchAccess(user, notification.branchId);

      if (notification.channel !== NOTIFICATION_CHANNEL_EMAIL) {
        throw new BadRequestException(
          'Only email channel notifications can be resent',
        );
      }

      if (notification.status !== NotificationStatus.FAILED) {
        throw new ConflictException(
          'Only failed notifications are eligible for email resend',
        );
      }

      if (!notification.outboxId) {
        throw new BadRequestException(
          'Notification is missing outbox linkage required for dispatch',
        );
      }

      const reset = await transaction.notification.updateMany({
        where: {
          id: notification.id,
          hospitalId: user.hospitalId,
          channel: NOTIFICATION_CHANNEL_EMAIL,
          status: NotificationStatus.FAILED,
          outboxId: { not: null },
        },
        data: {
          status: NotificationStatus.PENDING,
          lastError: null,
          failedAt: null,
        },
      });

      if (reset.count !== 1) {
        throw new ConflictException(
          'Notification is not eligible for email resend',
        );
      }

      const job = await this.jobService.enqueueWithClient(transaction, {
        hospitalId: notification.hospitalId,
        branchId: notification.branchId,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        idempotencyKey: `notification.dispatch:resend:${notification.id}:${randomUUID()}`,
        payload: { outboxId: notification.outboxId },
        maxAttempts: 5,
      });

      await this.auditService.logInTransaction(transaction, {
        action: 'NOTIFICATION_EMAIL_RESEND_REQUESTED',
        entity: 'Notification',
        entityId: notification.id,
        hospitalId: user.hospitalId,
        branchId: notification.branchId,
        userId: user.sub,
        metadata: {
          jobId: job.id,
          outboxId: notification.outboxId,
        },
      });

      return {
        notificationId: notification.id,
        jobId: job.id,
        status: 'queued',
      };
    });
  }
}
