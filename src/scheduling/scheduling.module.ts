import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { AppointmentsController } from './appointments/appointments.controller';
import { AppointmentsService } from './appointments/appointments.service';
import { ResourcesController } from './resources/resources.controller';
import { ResourcesService } from './resources/resources.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [ResourcesController, AppointmentsController],
  providers: [ResourcesService, AppointmentsService],
  exports: [ResourcesService, AppointmentsService],
})
export class SchedulingModule {}
