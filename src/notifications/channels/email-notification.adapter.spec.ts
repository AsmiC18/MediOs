import { EmailNotificationAdapter } from './email-notification.adapter';

describe('EmailNotificationAdapter', () => {
  function createAdapter(send: jest.Mock) {
    const notificationService = {
      markFailed: jest.fn().mockResolvedValue(undefined),
      markDispatched: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new EmailNotificationAdapter(
      notificationService as never,
      { send },
    );
    return { adapter, notificationService, send };
  }

  const context = { jobId: 'j1', workerId: 'w1' };

  it('marks notification failed when provider unavailable', async () => {
    const { adapter, notificationService } = createAdapter(
      jest.fn(async () => ({
        outcome: 'unavailable',
        reason: 'EMAIL_PROVIDER not configured',
      })),
    );

    await adapter.dispatch(
      {
        id: 'n1',
        hospitalId: 'h1',
        category: 'test',
        payload: { emailTo: 'a@example.com' },
      } as never,
      context,
    );

    expect(notificationService.markFailed).toHaveBeenCalledWith(
      'n1',
      'h1',
      'EMAIL_PROVIDER not configured',
    );
  });

  it('reads top-level email fields and marks dispatched on success', async () => {
    const send = jest.fn(async () => ({
      outcome: 'sent',
      providerMessageId: 'msg-1',
    }));
    const { adapter, notificationService } = createAdapter(send);

    await adapter.dispatch(
      {
        id: 'n-top',
        hospitalId: 'h1',
        category: 'appointment.booked',
        payload: {
          emailTo: ' top@example.com ',
          emailSubject: 'Hello',
          emailBody: 'Plain body',
        },
      } as never,
      context,
    );

    expect(send).toHaveBeenCalledWith({
      to: 'top@example.com',
      subject: 'Hello',
      bodyText: 'Plain body',
      hospitalId: 'h1',
      notificationId: 'n-top',
    });
    expect(notificationService.markDispatched).toHaveBeenCalledWith(
      'n-top',
      'h1',
    );
  });

  it('reads email fields from nested payload.data (outbox conversion shape)', async () => {
    const send = jest.fn(async () => ({ outcome: 'sent' }));
    const { adapter } = createAdapter(send);

    await adapter.dispatch(
      {
        id: 'n-nested',
        hospitalId: 'h1',
        category: 'h3.email',
        payload: {
          source: 'domain_event_outbox',
          eventType: 'h3.email',
          entityType: 'Test',
          entityId: 'ent-1',
          data: {
            channel: 'email',
            emailTo: 'nested@example.com',
            emailSubject: 'Nested subject',
            emailBody: 'Nested body',
          },
        },
      } as never,
      context,
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'nested@example.com',
        subject: 'Nested subject',
        bodyText: 'Nested body',
      }),
    );
  });

  it('prefers top-level email fields over nested payload.data', async () => {
    const send = jest.fn(async () => ({ outcome: 'sent' }));
    const { adapter } = createAdapter(send);

    await adapter.dispatch(
      {
        id: 'n-precedence',
        hospitalId: 'h1',
        category: 'cat',
        payload: {
          emailTo: 'top@example.com',
          emailSubject: 'Top subject',
          emailBody: 'Top body',
          data: {
            emailTo: 'nested@example.com',
            emailSubject: 'Nested subject',
            emailBody: 'Nested body',
          },
        },
      } as never,
      context,
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'top@example.com',
        subject: 'Top subject',
        bodyText: 'Top body',
      }),
    );
  });

  it('marks failed with email_missing_recipient when recipient absent', async () => {
    const send = jest.fn();
    const { adapter, notificationService } = createAdapter(send);

    await adapter.dispatch(
      {
        id: 'n-no-to',
        hospitalId: 'h1',
        category: 'cat',
        payload: {
          source: 'domain_event_outbox',
          data: { emailSubject: 'S', emailBody: 'B' },
        },
      } as never,
      context,
    );

    expect(send).not.toHaveBeenCalled();
    expect(notificationService.markFailed).toHaveBeenCalledWith(
      'n-no-to',
      'h1',
      'email_missing_recipient',
    );
  });

  it('falls back subject to category and body to JSON.stringify(payload)', async () => {
    const send = jest.fn(async () => ({ outcome: 'sent' }));
    const { adapter } = createAdapter(send);
    const payload = { emailTo: 'only-to@example.com', extra: 1 };

    await adapter.dispatch(
      {
        id: 'n-fallback',
        hospitalId: 'h1',
        category: 'my.category',
        payload,
      } as never,
      context,
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'only-to@example.com',
        subject: 'my.category',
        bodyText: JSON.stringify(payload),
      }),
    );
  });
});
