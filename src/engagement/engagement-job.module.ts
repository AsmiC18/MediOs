import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EngagementModule } from './engagement.module';
import { PatientNpsTriggerHandler } from '../jobs/handlers/patient-nps-trigger.handler';
import { PatientWinbackHandler } from '../jobs/handlers/patient-winback.handler';

@Module({
  imports: [EngagementModule, NotificationsModule],
  providers: [PatientNpsTriggerHandler, PatientWinbackHandler],
  exports: [PatientNpsTriggerHandler, PatientWinbackHandler, EngagementModule],
})
export class EngagementJobModule {}
