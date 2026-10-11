import { Inject, Injectable, Logger } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { NotificationService } from '../notification.service';

export type EmailDispatchResult =
  | { outcome: 'sent'; providerMessageId?: string }
  | { outcome: 'unavailable'; reason: string }
  | { outcome: 'failed'; reason: string };

export interface EmailProviderAdapter {
  send(input: {
    to: string;
    subject: string;
    bodyText: string;
    hospitalId: string;
    notificationId: string;
  }): Promise<EmailDispatchResult>;
}

export const EMAIL_PROVIDER_ADAPTER = Symbol('EMAIL_PROVIDER_ADAPTER');

@Injectable()
export class UnconfiguredEmailProviderAdapter implements EmailProviderAdapter {
  async send(): Promise<EmailDispatchResult> {
    return {
      outcome: 'unavailable',
      reason: 'EMAIL_PROVIDER not configured',
    };
  }
}

@Injectable()
export class EmailNotificationAdapter {
  private readonly logger = new Logger(EmailNotificationAdapter.name);

  constructor(
    private readonly notificationService: NotificationService,
    @Inject(EMAIL_PROVIDER_ADAPTER)
    private readonly emailProvider: EmailProviderAdapter,
  ) {}

  async dispatch(
    notification: Notification,
    context: { jobId: string; workerId: string },
  ): Promise<void> {
    const payload = notification.payload as Record<string, unknown> | null;
    const to =
      typeof payload?.emailTo === 'string' ? payload.emailTo.trim() : '';
    if (!to) {
      await this.notificationService.markFailed(
        notification.id,
        notification.hospitalId,
        'email_missing_recipient',
      );
      return;
    }

    const subject =
      typeof payload?.emailSubject === 'string'
        ? payload.emailSubject
        : notification.category;
    const bodyText =
      typeof payload?.emailBody === 'string'
        ? payload.emailBody
        : JSON.stringify(payload ?? {});

    const result = await this.emailProvider.send({
      to,
      subject,
      bodyText,
      hospitalId: notification.hospitalId,
      notificationId: notification.id,
    });

    if (result.outcome === 'sent') {
      await this.notificationService.markDispatched(
        notification.id,
        notification.hospitalId,
      );
      return;
    }

    if (result.outcome === 'unavailable') {
      await this.notificationService.markFailed(
        notification.id,
        notification.hospitalId,
        result.reason,
      );
      this.logger.warn(
        JSON.stringify({
          event: 'email_notification_unavailable',
          reason: result.reason,
          jobId: context.jobId,
          notificationId: notification.id,
        }),
      );
      return;
    }

    await this.notificationService.markFailed(
      notification.id,
      notification.hospitalId,
      result.reason,
    );
  }
}
