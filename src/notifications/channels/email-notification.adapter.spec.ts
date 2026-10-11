import { EmailNotificationAdapter } from './email-notification.adapter';

describe('EmailNotificationAdapter', () => {
  it('marks notification failed when provider unavailable', async () => {
    const notificationService = {
      markFailed: jest.fn().mockResolvedValue(undefined),
      markDispatched: jest.fn(),
    };
    const adapter = new EmailNotificationAdapter(
      notificationService as never,
      {
        send: async () => ({ outcome: 'unavailable', reason: 'EMAIL_PROVIDER not configured' }),
      },
    );

    await adapter.dispatch(
      {
        id: 'n1',
        hospitalId: 'h1',
        category: 'test',
        payload: { emailTo: 'a@example.com' },
      } as never,
      { jobId: 'j1', workerId: 'w1' },
    );

    expect(notificationService.markFailed).toHaveBeenCalledWith(
      'n1',
      'h1',
      'EMAIL_PROVIDER not configured',
    );
  });
});
