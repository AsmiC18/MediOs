import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type {
  EmailDispatchResult,
  EmailProviderAdapter,
} from './email-notification.adapter';

const UNAVAILABLE_API_KEY = 'resend_api_key_missing';
const UNAVAILABLE_FROM = 'resend_from_email_missing';
const FAILED_NO_MESSAGE_ID = 'resend_no_message_id';
const FAILED_REQUEST = 'resend_request_error';
const FAILED_PROVIDER = 'resend_provider_error';

function readResendConfig(): { apiKey: string; fromEmail: string } {
  return {
    apiKey: process.env.RESEND_API_KEY?.trim() ?? '',
    fromEmail: process.env.RESEND_FROM_EMAIL?.trim() ?? '',
  };
}

/** Resend tag values: ASCII letters, digits, underscore, dash; max 256 chars. */
function toResendTagValue(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized.length > 256 ? sanitized.slice(0, 256) : sanitized;
}

function failureReasonFromProviderCode(code: string | undefined): string {
  if (!code) {
    return FAILED_PROVIDER;
  }
  const normalized = code.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
  return normalized ? `resend_${normalized}` : FAILED_PROVIDER;
}

@Injectable()
export class ResendEmailProviderAdapter implements EmailProviderAdapter {
  private readonly logger = new Logger(ResendEmailProviderAdapter.name);

  async send(input: {
    to: string;
    subject: string;
    bodyText: string;
    hospitalId: string;
    notificationId: string;
  }): Promise<EmailDispatchResult> {
    const { apiKey, fromEmail } = readResendConfig();

    if (!apiKey) {
      return { outcome: 'unavailable', reason: UNAVAILABLE_API_KEY };
    }

    if (!fromEmail) {
      return { outcome: 'unavailable', reason: UNAVAILABLE_FROM };
    }

    try {
      const client = new Resend(apiKey);
      const response = await client.emails.send({
        from: fromEmail,
        to: input.to,
        subject: input.subject,
        text: input.bodyText,
        tags: [
          {
            name: 'notification_id',
            value: toResendTagValue(input.notificationId),
          },
          {
            name: 'hospital_id',
            value: toResendTagValue(input.hospitalId),
          },
        ],
      });

      if (response.error) {
        const reason = failureReasonFromProviderCode(response.error.name);
        this.logger.warn(
          JSON.stringify({
            event: 'resend_send_rejected',
            reason,
            notificationId: input.notificationId,
          }),
        );
        return { outcome: 'failed', reason };
      }

      const messageId = response.data?.id?.trim();
      if (!messageId) {
        return { outcome: 'failed', reason: FAILED_NO_MESSAGE_ID };
      }

      return { outcome: 'sent', providerMessageId: messageId };
    } catch {
      this.logger.warn(
        JSON.stringify({
          event: 'resend_send_exception',
          notificationId: input.notificationId,
        }),
      );
      return { outcome: 'failed', reason: FAILED_REQUEST };
    }
  }
}
