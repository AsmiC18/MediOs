import { Injectable, Logger } from '@nestjs/common';
import {
  DomainEventOutboxStatus,
  Job,
  Notification,
  NotificationStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { EmailNotificationAdapter } from './channels/email-notification.adapter';
import { InAppNotificationAdapter } from './channels/in-app-notification.adapter';
import {
  NOTIFICATION_CHANNEL_EMAIL,
  NOTIFICATION_CHANNEL_IN_APP,
  NOTIFICATION_CHANNEL_UNROUTED,
  NOTIFICATION_CHANNEL_WHATSAPP,
  NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
} from './notification.constants';
import { DomainEventOutboxService } from './domain-event-outbox.service';
import { NotificationDispatchJobPayload } from './domain-event.types';
import { NotificationPolicyService } from './notification-policy.service';
import { NotificationService } from './notification.service';
import { StaffDomainEventInAppRouterService } from './staff-domain-event-in-app.router.service';

/**
 * H2: outbox PENDING -> Notification PENDING (+ outbox PROCESSED).
 * H3: Notification PENDING -> email/in-app adapters, or explicit SKIPPED for channel=whatsapp
 * (policy skip reasons unchanged; allowed delivery uses lastError channel_not_configured).
 * Outbox PROCESSED / Notification DISPATCHED do not mean the patient received the message.
 *
 * Email uses the same durable NOTIFICATION_DISPATCH job (retries, idempotency, terminal FAILED).
 * No separate email-only queue unless requirements change.
 */
@Injectable()
export class NotificationDispatchJobHandler {
  private readonly logger = new Logger(NotificationDispatchJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly notificationService: NotificationService,
    private readonly inAppNotificationAdapter: InAppNotificationAdapter,
    private readonly emailNotificationAdapter: EmailNotificationAdapter,
    private readonly notificationPolicyService: NotificationPolicyService,
    private readonly staffDomainEventInAppRouter: StaffDomainEventInAppRouterService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.NOTIFICATION_DISPATCH) {
      throw new Error(
        `Unexpected job type for notification dispatch handler: ${job.type}`,
      );
    }

    const payload = job.payload as NotificationDispatchJobPayload;
    const outboxId = payload?.outboxId;
    if (!outboxId || typeof outboxId !== 'string') {
      throw new JobPermanentFailureError(
        'Notification dispatch job payload must include outboxId',
      );
    }

    const outbox = await this.domainEventOutboxService.findByIdForHospital(
      outboxId,
      job.hospitalId,
    );

    if (!outbox) {
      throw new JobPermanentFailureError(
        'Domain event outbox row not found for job hospital scope',
      );
    }

    if (outbox.hospitalId !== job.hospitalId) {
      throw new JobPermanentFailureError(
        'Domain event outbox hospital does not match job hospital scope',
      );
    }

    await this.staffDomainEventInAppRouter.routeFromOutbox(outbox);

    if (outbox.status === DomainEventOutboxStatus.FAILED) {
      this.logger.log(
        JSON.stringify({
          event: 'notification_dispatch_skipped',
          reason: 'outbox_already_failed',
          jobId: job.id,
          outboxId,
          hospitalId: job.hospitalId,
        }),
      );
      return;
    }

    let notification: Notification | null = null;

    if (outbox.status === DomainEventOutboxStatus.PENDING) {
      notification = await this.prisma.$transaction(async (tx) => {
        const created =
          await this.notificationService.createOrGetFromOutboxInTransaction(
            tx,
            outbox,
          );
        await this.domainEventOutboxService.markProcessedIfPending(
          outbox.id,
          job.hospitalId,
          tx,
        );
        return created;
      });

      this.logger.log(
        JSON.stringify({
          event: 'notification_persisted_from_outbox',
          jobId: job.id,
          workerId: workerContext.workerId,
          outboxId,
          notificationId: notification.id,
          hospitalId: job.hospitalId,
          branchId: job.branchId,
          eventType: outbox.eventType,
          entityType: outbox.entityType,
          entityId: outbox.entityId,
        }),
      );
    } else if (outbox.status === DomainEventOutboxStatus.PROCESSED) {
      notification = await this.notificationService.findByOutboxIdForHospital(
        outboxId,
        job.hospitalId,
      );
      if (!notification) {
        throw new JobPermanentFailureError(
          'Processed outbox row has no linked notification (consistency error)',
        );
      }
    } else {
      throw new JobPermanentFailureError(
        `Unsupported domain event outbox status: ${outbox.status}`,
      );
    }

    if (notification.hospitalId !== job.hospitalId) {
      throw new JobPermanentFailureError(
        'Notification hospital does not match job hospital scope',
      );
    }

    await this.dispatchNotificationChannels(
      notification,
      job,
      workerContext,
    );
  }

  private async dispatchNotificationChannels(
    notification: Notification,
    job: Job,
    workerContext: JobExecutionContext,
  ): Promise<void> {
    if (
      notification.status === NotificationStatus.DISPATCHED ||
      notification.status === NotificationStatus.FAILED ||
      notification.status === NotificationStatus.CANCELLED ||
      notification.status === NotificationStatus.SKIPPED
    ) {
      this.logger.log(
        JSON.stringify({
          event: 'notification_channel_dispatch_skipped',
          reason: notification.status.toLowerCase(),
          jobId: job.id,
          notificationId: notification.id,
          hospitalId: job.hospitalId,
        }),
      );
      return;
    }

    if (notification.status !== NotificationStatus.PENDING) {
      throw new JobPermanentFailureError(
        `Unsupported notification status: ${notification.status}`,
      );
    }

    if (notification.channel === NOTIFICATION_CHANNEL_UNROUTED) {
      this.logger.log(
        JSON.stringify({
          event: 'notification_channel_dispatch_deferred',
          reason: 'channel_unrouted',
          jobId: job.id,
          notificationId: notification.id,
          hospitalId: job.hospitalId,
        }),
      );
      return;
    }

    if (notification.channel === NOTIFICATION_CHANNEL_IN_APP) {
      await this.inAppNotificationAdapter.dispatch(notification, {
        jobId: job.id,
        workerId: workerContext.workerId,
      });
      return;
    }

    if (notification.channel === NOTIFICATION_CHANNEL_EMAIL) {
      await this.emailNotificationAdapter.dispatch(notification, {
        jobId: job.id,
        workerId: workerContext.workerId,
      });
      return;
    }

    if (notification.channel === NOTIFICATION_CHANNEL_WHATSAPP) {
      const policyDecision = await this.notificationPolicyService.evaluate(
        notification,
        {
          jobId: job.id,
          workerId: workerContext.workerId,
        },
      );

      if (policyDecision.action === 'SKIP') {
        await this.notificationService.markSkipped(
          notification.id,
          notification.hospitalId,
          policyDecision.reasonCode,
        );

        this.logger.log(
          JSON.stringify({
            event: 'notification_policy_skipped',
            reason: policyDecision.reasonCode,
            jobId: job.id,
            notificationId: notification.id,
            hospitalId: job.hospitalId,
            category: notification.category,
          }),
        );
        return;
      }

      await this.assertWhatsAppNotificationPatientScope(notification);

      await this.notificationService.markSkipped(
        notification.id,
        notification.hospitalId,
        NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
      );

      this.logger.log(
        JSON.stringify({
          event: 'notification_whatsapp_channel_skipped',
          reason: NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
          jobId: job.id,
          notificationId: notification.id,
          hospitalId: job.hospitalId,
          category: notification.category,
        }),
      );
      return;
    }

    await this.notificationService.markSkipped(
      notification.id,
      notification.hospitalId,
      `Unsupported notification channel: ${notification.channel}`,
    );

    this.logger.log(
      JSON.stringify({
        event: 'notification_channel_skipped',
        reason: 'unsupported_channel',
        channel: notification.channel,
        jobId: job.id,
        notificationId: notification.id,
        hospitalId: job.hospitalId,
      }),
    );
  }

  private async assertWhatsAppNotificationPatientScope(
    notification: Notification,
  ): Promise<void> {
    if (!notification.patientId) {
      throw new JobPermanentFailureError(
        'WhatsApp notification requires patientId',
      );
    }

    const patient = await this.prisma.patient.findFirst({
      where: {
        id: notification.patientId,
        hospitalId: notification.hospitalId,
      },
      select: { id: true },
    });

    if (!patient) {
      throw new JobPermanentFailureError(
        'Patient not found for WhatsApp notification patient scope',
      );
    }
  }
}
