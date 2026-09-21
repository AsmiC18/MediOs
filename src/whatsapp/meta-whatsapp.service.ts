import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

export type SendTextInput = {
  toPhone: string;
  text: string;
  mockFail?: boolean;
};

export type SendTemplateInput = {
  toPhone: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
  mockFail?: boolean;
};

export type MetaSendResult = {
  providerMessageId: string;
};

@Injectable()
export class MetaWhatsAppService {
  private getGraphApiVersion(): string {
    return process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v22.0';
  }

  private getGraphApiBaseUrl(): string {
    return `https://graph.facebook.com/${this.getGraphApiVersion()}`;
  }

  private getPhoneNumberId(): string {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

    if (!phoneNumberId) {
      throw new BadRequestException('WhatsApp phone number ID is not configured');
    }

    return phoneNumberId;
  }

  private getAccessToken(): string {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();

    if (!accessToken) {
      throw new BadRequestException('WhatsApp access token is not configured');
    }

    return accessToken;
  }

  private createMockMessageId(): string {
    return `wamid.mock.${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  private assertMockFailure(input: { mockFail?: boolean; text?: string }): void {
    if (input.mockFail || input.text === 'MOCK_SEND_FAIL') {
      throw new InternalServerErrorException('Mock WhatsApp send failure');
    }
  }

  async sendText(input: SendTextInput): Promise<MetaSendResult> {
    if (process.env.WHATSAPP_MOCK_MODE === 'true') {
      this.assertMockFailure(input);
      return { providerMessageId: this.createMockMessageId() };
    }

    const phoneNumberId = this.getPhoneNumberId();
    const accessToken = this.getAccessToken();
    const url = `${this.getGraphApiBaseUrl()}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: input.toPhone,
        type: 'text',
        text: {
          body: input.text,
        },
      }),
    });

    const body = (await response.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      throw new InternalServerErrorException(
        body.error?.message ?? 'Failed to send WhatsApp text message',
      );
    }

    const providerMessageId = body.messages?.[0]?.id;

    if (!providerMessageId) {
      throw new InternalServerErrorException(
        'WhatsApp text message response was incomplete',
      );
    }

    return { providerMessageId };
  }

  async sendTemplate(input: SendTemplateInput): Promise<MetaSendResult> {
    if (process.env.WHATSAPP_MOCK_MODE === 'true') {
      this.assertMockFailure(input);
      return { providerMessageId: this.createMockMessageId() };
    }

    const phoneNumberId = this.getPhoneNumberId();
    const accessToken = this.getAccessToken();
    const url = `${this.getGraphApiBaseUrl()}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: input.toPhone,
        type: 'template',
        template: {
          name: input.templateName,
          language: {
            code: input.languageCode,
          },
          components: [
            {
              type: 'body',
              parameters: input.parameters.map((value) => ({
                type: 'text',
                text: value,
              })),
            },
          ],
        },
      }),
    });

    const body = (await response.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      throw new InternalServerErrorException(
        body.error?.message ?? 'Failed to send WhatsApp template message',
      );
    }

    const providerMessageId = body.messages?.[0]?.id;

    if (!providerMessageId) {
      throw new InternalServerErrorException(
        'WhatsApp template message response was incomplete',
      );
    }

    return { providerMessageId };
  }
}
