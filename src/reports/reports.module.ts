import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { ReportExportPermissionsGuard } from './guards/report-export-permissions.guard';
import { ReportsController } from './reports.controller';
import { ReportProjectionService } from './report-projection.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [CommonModule, AuthModule, AuditModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportProjectionService, ReportExportPermissionsGuard],
  exports: [ReportsService, ReportProjectionService],
})
export class ReportsModule {}
