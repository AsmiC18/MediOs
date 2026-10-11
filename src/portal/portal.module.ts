import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { BillingModule } from '../billing/billing.module';
import { PatientPrivacyModule } from '../privacy/patient-privacy.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { DiagnosticsModule } from '../diagnostics/diagnostics.module';
import { PatientsModule } from '../patients/patients.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { PatientPortalAuthController } from './portal-auth/patient-portal-auth.controller';
import { PatientPortalAuthService } from './portal-auth/patient-portal-auth.service';
import { PatientPortalSessionService } from './portal-auth/patient-portal-session.service';
import { PortalLoginRateLimitService } from './portal-auth/portal-login-rate-limit.service';
import { PortalJwtAuthGuard } from './portal-auth/guards/portal-jwt-auth.guard';
import { PortalPrincipalGuard } from './portal-auth/guards/portal-principal.guard';
import { PortalJwtStrategy } from './portal-auth/strategies/portal-jwt.strategy';
import { PortalAppointmentsController } from './portal-appointments/portal-appointments.controller';
import { PortalPatientsController } from './portal-patients/portal-patients.controller';
import { PortalPatientsService } from './portal-patients/portal-patients.service';
import { PortalBillingController } from './portal-billing/portal-billing.controller';
import { PortalBillingService } from './portal-billing/portal-billing.service';
import { PortalPatientRecordsController } from './portal-records/portal-patient-records.controller';
import { PortalPatientRecordsService } from './portal-records/portal-patient-records.service';
import { PortalPrivacyController } from './portal-privacy/portal-privacy.controller';
import { PortalPrivacyService } from './portal-privacy/portal-privacy.service';
import { EngagementModule } from '../engagement/engagement.module';
import { PortalEngagementController } from './portal-engagement/portal-engagement.controller';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [
    CommonModule,
    AuditModule,
    AuthModule,
    SchedulingModule,
    PatientsModule,
    ClinicalModule,
    DiagnosticsModule,
    BillingModule,
    PatientPrivacyModule,
    EngagementModule,
    PlansModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [
    PatientPortalAuthController,
    PortalPatientsController,
    PortalAppointmentsController,
    PortalPatientRecordsController,
    PortalBillingController,
    PortalPrivacyController,
    PortalEngagementController,
  ],
  providers: [
    PatientPortalAuthService,
    PatientPortalSessionService,
    PortalLoginRateLimitService,
    PortalJwtStrategy,
    PortalJwtAuthGuard,
    PortalPrincipalGuard,
    PortalPatientsService,
    PortalPatientRecordsService,
    PortalBillingService,
    PortalPrivacyService,
  ],
})
export class PortalModule {}
