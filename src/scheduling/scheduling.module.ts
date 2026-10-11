import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EngagementModule } from '../engagement/engagement.module';
import { AppointmentsController } from './appointments/appointments.controller';
import { AppointmentsService } from './appointments/appointments.service';
import { ResourcesController } from './resources/resources.controller';
import { ResourcesService } from './resources/resources.service';
import { SchedulingPolicyService } from './scheduling-policy.service';

@Module({
  imports: [CommonModule, AuditModule, NotificationsModule, EngagementModule],
  controllers: [ResourcesController, AppointmentsController],
  providers: [ResourcesService, SchedulingPolicyService, AppointmentsService],
  exports: [ResourcesService, SchedulingPolicyService, AppointmentsService],
})
export class SchedulingModule {}
