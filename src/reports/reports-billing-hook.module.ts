import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { JobModule } from '../jobs/job.module';
import { ReportProjectionBillingHookService } from './report-projection-billing-hook.service';

@Module({
  imports: [CommonModule, JobModule],
  providers: [ReportProjectionBillingHookService],
  exports: [ReportProjectionBillingHookService],
})
export class ReportsBillingHookModule {}
