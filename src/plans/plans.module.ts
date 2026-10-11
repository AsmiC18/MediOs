import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { FeatureGateService } from './feature-gate.service';
import { FeatureGuard } from './feature.guard';
import { PlansController } from './plans.controller';
import { HospitalDepartmentToggleService } from './hospital-department-toggle.service';
import { PlansService } from './plans.service';

@Global()
@Module({
  imports: [CommonModule, AuditModule],
  controllers: [PlansController],
  providers: [
    FeatureGateService,
    FeatureGuard,
    PlansService,
    HospitalDepartmentToggleService,
  ],
  exports: [FeatureGateService, FeatureGuard, HospitalDepartmentToggleService],
})
export class PlansModule {}
