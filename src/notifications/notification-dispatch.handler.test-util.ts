import { PrismaClient } from '@prisma/client';
import { JobService } from '../jobs/job.service';
import { EmailNotificationAdapter } from './channels/email-notification.adapter';
import { InAppNotificationAdapter } from './channels/in-app-notification.adapter';
import { DomainEventOutboxService } from './domain-event-outbox.service';
import { NotificationDispatchJobHandler } from './notification-dispatch.job-handler';
import { NotificationPolicyService } from './notification-policy.service';
import { NotificationService } from './notification.service';
import { PatientNotificationPreferenceService } from './patient-notification-preference.service';

export function createTestChannelAdapters(notificationService: NotificationService) {
  const staffInAppService = {
    createForStaffUser: jest.fn().mockResolvedValue(undefined),
  };
  const inAppAdapter = new InAppNotificationAdapter(
    staffInAppService as never,
    notificationService,
  );
  const emailAdapter = new EmailNotificationAdapter(notificationService, {
    send: async () => ({ outcome: 'unavailable', reason: 'test' }),
  });
  return { inAppAdapter, emailAdapter };
}

export function instantiateNotificationDispatchJobHandler(input: {
  prisma: PrismaClient;
  outboxService: DomainEventOutboxService;
  notificationService: NotificationService;
  policyService: NotificationPolicyService;
  inAppAdapter?: InAppNotificationAdapter;
  emailAdapter?: EmailNotificationAdapter;
}): NotificationDispatchJobHandler {
  const { inAppAdapter, emailAdapter } = createTestChannelAdapters(
    input.notificationService,
  );
  const staffDomainEventInAppRouter = {
    routeFromOutbox: jest.fn().mockResolvedValue(0),
  };

  return new NotificationDispatchJobHandler(
    input.prisma as never,
    input.outboxService,
    input.notificationService,
    input.inAppAdapter ?? inAppAdapter,
    input.emailAdapter ?? emailAdapter,
    input.policyService,
    staffDomainEventInAppRouter as never,
  );
}

export type NotificationDispatchHandlerTestStack = {
  prisma: PrismaClient;
  jobService: JobService;
  outboxService: DomainEventOutboxService;
  notificationService: NotificationService;
  preferenceService: PatientNotificationPreferenceService;
  policyService: NotificationPolicyService;
  handler: NotificationDispatchJobHandler;
};

export function createNotificationDispatchHandlerTestStack(
  prisma: PrismaClient,
): NotificationDispatchHandlerTestStack {
  const jobService = new JobService(prisma as never);
  const outboxService = new DomainEventOutboxService(prisma as never, jobService);
  const notificationService = new NotificationService(prisma as never);
  const preferenceService = new PatientNotificationPreferenceService(
    prisma as never,
  );
  const policyService = new NotificationPolicyService(
    prisma as never,
    preferenceService,
  );
  const handler = instantiateNotificationDispatchJobHandler({
    prisma,
    outboxService,
    notificationService,
    policyService,
  });

  return {
    prisma,
    jobService,
    outboxService,
    notificationService,
    preferenceService,
    policyService,
    handler,
  };
}
