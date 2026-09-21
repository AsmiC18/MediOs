import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { IpdAdmissionController } from './ipd-admission.controller';
import { IpdAdmissionService } from './ipd-admission.service';
import { IpdBedController } from './ipd-bed.controller';
import { IpdBedService } from './ipd-bed.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [IpdBedController, IpdAdmissionController],
  providers: [IpdBedService, IpdAdmissionService],
  exports: [IpdBedService, IpdAdmissionService],
})
export class IpdModule {}
