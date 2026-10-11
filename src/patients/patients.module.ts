import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientPrivacyModule } from '../privacy/patient-privacy.module';
import { EngagementModule } from '../engagement/engagement.module';
import { PatientsController } from './patients.controller';
import { PatientTimelineService } from './patient-timeline.service';
import { PatientsService } from './patients.service';

@Module({
  imports: [
    CommonModule,
    AuditModule,
    NotificationsModule,
    PatientPrivacyModule,
    EngagementModule,
  ],
  controllers: [PatientsController],
  providers: [PatientsService, PatientTimelineService],
  exports: [PatientsService, PatientTimelineService],
})
export class PatientsModule {}
