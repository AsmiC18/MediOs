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

function extractNestedOutboxData(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }
  const data = payload.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

function readEmailTo(payload: Record<string, unknown> | null): string {
  if (!payload) {
    return '';
  }
  const top = payload.emailTo;
  if (typeof top === 'string' && top.trim()) {
    return top.trim();
  }
  const nested = extractNestedOutboxData(payload);
  const fromData = nested?.emailTo;
  if (typeof fromData === 'string' && fromData.trim()) {
    return fromData.trim();
  }
  return '';
}

function readEmailSubjectField(
  payload: Record<string, unknown> | null,
): string | undefined {
  if (!payload) {
    return undefined;
  }
  if (typeof payload.emailSubject === 'string') {
    return payload.emailSubject;
  }
  const nested = extractNestedOutboxData(payload);
  if (nested && typeof nested.emailSubject === 'string') {
    return nested.emailSubject;
  }
  return undefined;
}

function readEmailBodyField(
  payload: Record<string, unknown> | null,
): string | undefined {
  if (!payload) {
    return undefined;
  }
  if (typeof payload.emailBody === 'string') {
    return payload.emailBody;
  }
  const nested = extractNestedOutboxData(payload);
  if (nested && typeof nested.emailBody === 'string') {
    return nested.emailBody;
  }
  return undefined;
}

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
    const to = readEmailTo(payload);
    if (!to) {
      await this.notificationService.markFailed(
        notification.id,
        notification.hospitalId,
        'email_missing_recipient',
      );
      return;
    }

    const subjectField = readEmailSubjectField(payload);
    const subject =
      subjectField !== undefined ? subjectField : notification.category;
    const bodyField = readEmailBodyField(payload);
    const bodyText =
      bodyField !== undefined ? bodyField : JSON.stringify(payload ?? {});

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
