import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { JobModule } from '../jobs/job.module';
import {
  DIAGNOSTIC_LAB_AGGREGATOR_ADAPTER,
} from './adapters/diagnostic-lab-aggregator.adapter';
import { ManualDiagnosticLabAggregatorAdapter } from './adapters/manual-diagnostic-lab-aggregator.adapter';
import { DiagnosticAggregatorSubmitJobHandler } from './diagnostic-aggregator-submit.job-handler';
import { DiagnosticAggregatorService } from './diagnostic-aggregator.service';

@Module({
  imports: [CommonModule, AuditModule, JobModule],
  providers: [
    ManualDiagnosticLabAggregatorAdapter,
    {
      provide: DIAGNOSTIC_LAB_AGGREGATOR_ADAPTER,
      useExisting: ManualDiagnosticLabAggregatorAdapter,
    },
    DiagnosticAggregatorService,
    DiagnosticAggregatorSubmitJobHandler,
  ],
  exports: [
    DiagnosticAggregatorService,
    DiagnosticAggregatorSubmitJobHandler,
  ],
})
export class DiagnosticsJobModule {}
