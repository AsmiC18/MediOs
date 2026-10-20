const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => mockSend(...args) },
  })),
}));

import { Resend } from 'resend';
import { ResendEmailProviderAdapter } from './resend-email.provider';

describe('ResendEmailProviderAdapter', () => {
  const adapter = new ResendEmailProviderAdapter();
  const baseInput = {
    to: 'patient@example.com',
    subject: 'Test subject',
    bodyText: 'Hello',
    hospitalId: 'hospital-uuid-1',
    notificationId: 'notification-uuid-1',
  };

  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'MediOS <notify@example.com>';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns unavailable when API key is missing', async () => {
    delete process.env.RESEND_API_KEY;

    const result = await adapter.send(baseInput);

    expect(result).toEqual({
      outcome: 'unavailable',
      reason: 'resend_api_key_missing',
    });
    expect(Resend).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns unavailable when sender address is missing', async () => {
    delete process.env.RESEND_FROM_EMAIL;

    const result = await adapter.send(baseInput);

    expect(result).toEqual({
      outcome: 'unavailable',
      reason: 'resend_from_email_missing',
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns sent with provider message id on success', async () => {
    mockSend.mockResolvedValue({
      data: { id: 'msg_abc123' },
      error: null,
      headers: null,
    });

    const result = await adapter.send(baseInput);

    expect(result).toEqual({
      outcome: 'sent',
      providerMessageId: 'msg_abc123',
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'MediOS <notify@example.com>',
        to: baseInput.to,
        subject: baseInput.subject,
        text: baseInput.bodyText,
        tags: [
          { name: 'notification_id', value: 'notification-uuid-1' },
          { name: 'hospital_id', value: 'hospital-uuid-1' },
        ],
      }),
    );
  });

  it('returns failed with bounded reason when provider returns error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: 'Detailed provider message',
        statusCode: 422,
      },
      headers: null,
    });

    const result = await adapter.send(baseInput);

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'resend_validation_error',
    });
  });

  it('returns failed when response has no message id', async () => {
    mockSend.mockResolvedValue({
      data: { id: '   ' },
      error: null,
      headers: null,
    });

    const result = await adapter.send(baseInput);

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'resend_no_message_id',
    });
  });

  it('returns failed when send throws', async () => {
    mockSend.mockRejectedValue(new Error('network down'));

    const result = await adapter.send(baseInput);

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'resend_request_error',
    });
  });
});
