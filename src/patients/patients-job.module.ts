import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EngagementJobModule } from '../engagement/engagement-job.module';
import { PatientsService } from './patients.service';

/** Patient CRM services for background workers (no HTTP controllers). */
@Module({
  imports: [CommonModule, AuditModule, NotificationsModule, EngagementJobModule],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsJobModule {}
