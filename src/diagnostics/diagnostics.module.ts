import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { DiagnosticOrderController } from './diagnostic-order.controller';
import { DiagnosticOrderItemController } from './diagnostic-order-item.controller';
import { DiagnosticsService } from './diagnostics.service';
import { PatientDiagnosticsController } from './patient-diagnostics.controller';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [
    DiagnosticOrderController,
    DiagnosticOrderItemController,
    PatientDiagnosticsController,
  ],
  providers: [DiagnosticsService],
  exports: [DiagnosticsService],
})
export class DiagnosticsModule {}
