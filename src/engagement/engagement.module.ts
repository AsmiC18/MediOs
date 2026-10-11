import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { JobModule } from '../jobs/job.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';
import {
  EngagementController,
  PatientsEngagementController,
} from './engagement.controller';
import { PatientEngagementActionService } from './patient-engagement-action.service';
import { PatientEngagementAppointmentService } from './patient-engagement-appointment.service';
import { PatientNpsService } from './patient-nps.service';
import { PatientWinbackService } from './patient-winback.service';
import { WhatsappBroadcastSegmentationService } from './whatsapp-broadcast-segmentation.service';

@Module({
  imports: [
    CommonModule,
    AuditModule,
    NotificationsModule,
    JobModule,
    PlansModule,
  ],
  controllers: [EngagementController, PatientsEngagementController],
  providers: [
    PatientEngagementActionService,
    PatientNpsService,
    PatientWinbackService,
    PatientEngagementAppointmentService,
    WhatsappBroadcastSegmentationService,
  ],
  exports: [
    PatientEngagementActionService,
    PatientEngagementAppointmentService,
    PatientNpsService,
    PatientWinbackService,
    WhatsappBroadcastSegmentationService,
  ],
})
export class EngagementModule {}
