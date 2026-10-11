import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { IpdAdmissionController } from './ipd-admission.controller';
import { IpdAdmissionService } from './ipd-admission.service';
import { IpdBedController } from './ipd-bed.controller';
import { IpdBedService } from './ipd-bed.service';
import { IpdDailyChartController } from './ipd-daily-chart.controller';
import { IpdDailyChartService } from './ipd-daily-chart.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [IpdBedController, IpdAdmissionController, IpdDailyChartController],
  providers: [IpdBedService, IpdAdmissionService, IpdDailyChartService],
  exports: [IpdBedService, IpdAdmissionService, IpdDailyChartService],
})
export class IpdModule {}
