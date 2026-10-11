import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ReportProjectionRefreshJobHandler } from './report-projection-refresh.job-handler';
import { ReportsModule } from './reports.module';

@Module({
  imports: [CommonModule, AuthModule, AuditModule, ReportsModule],
  providers: [ReportProjectionRefreshJobHandler],
  exports: [ReportProjectionRefreshJobHandler],
})
export class ReportsJobModule {}
