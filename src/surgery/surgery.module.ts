import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';

import { DepartmentBillingJobModule } from '../billing/department/department-billing-job.module';

import { CommonModule } from '../common/common.module';

import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { SurgeryRequestController } from './surgery-request.controller';

import { SurgeryScheduleController } from './surgery-schedule.controller';

import { SurgeryService } from './surgery.service';
import { SurgeryPreOpChecklistService } from './surgery-pre-op-checklist.service';



@Module({

  imports: [
    CommonModule,
    AuditModule,
    SchedulingModule,
    NotificationsModule,
    DepartmentBillingJobModule,
  ],

  controllers: [SurgeryRequestController, SurgeryScheduleController],

  providers: [SurgeryService, SurgeryPreOpChecklistService],

  exports: [SurgeryService],

})

export class SurgeryModule {}


