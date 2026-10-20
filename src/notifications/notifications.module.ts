import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';

import { CommonModule } from '../common/common.module';

import { JobModule } from '../jobs/job.module';

import {

  EMAIL_PROVIDER_ADAPTER,

  EmailNotificationAdapter,

} from './channels/email-notification.adapter';

import { ResendEmailProviderAdapter } from './channels/resend-email.provider';

import { InAppNotificationAdapter } from './channels/in-app-notification.adapter';

import { DomainEventOutboxService } from './domain-event-outbox.service';

import { NotificationPolicyService } from './notification-policy.service';

import { PatientNotificationPreferenceService } from './patient-notification-preference.service';

import { NotificationService } from './notification.service';

import { StaffInAppNotificationService } from './staff-in-app-notification.service';

import { StaffDomainEventInAppRouterService } from './staff-domain-event-in-app.router.service';

import { StaffNotificationsController } from './staff-notifications.controller';

import { NotificationDeliveryStatsController } from './notification-delivery-stats.controller';

import { NotificationDeliveryStatsService } from './notification-delivery-stats.service';

import { NotificationEmailResendController } from './notification-email-resend.controller';

import { NotificationEmailResendService } from './notification-email-resend.service';



@Module({

  imports: [CommonModule, JobModule, AuditModule],

  controllers: [
    StaffNotificationsController,
    NotificationDeliveryStatsController,
    NotificationEmailResendController,
  ],

  providers: [

    DomainEventOutboxService,

    NotificationService,

    PatientNotificationPreferenceService,

    NotificationPolicyService,

    StaffInAppNotificationService,

    StaffDomainEventInAppRouterService,

    NotificationDeliveryStatsService,

    NotificationEmailResendService,

    InAppNotificationAdapter,

    ResendEmailProviderAdapter,

    {

      provide: EMAIL_PROVIDER_ADAPTER,

      useExisting: ResendEmailProviderAdapter,

    },

    EmailNotificationAdapter,

  ],

  exports: [

    DomainEventOutboxService,

    NotificationService,

    PatientNotificationPreferenceService,

    NotificationPolicyService,

    InAppNotificationAdapter,

    EmailNotificationAdapter,

    StaffInAppNotificationService,

    StaffDomainEventInAppRouterService,

    NotificationDeliveryStatsService,

    NotificationEmailResendService,

  ],

})

export class NotificationsModule {}


