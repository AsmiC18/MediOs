import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { BillingModule } from './billing/billing.module';
import { AttendanceModule } from './attendance/attendance.module';
import { WorkSchedulesModule } from './work-schedules/work-schedules.module';
import { BookingRulesModule } from './booking-rules/booking-rules.module';
import { RosterModule } from './roster/roster.module';
import { LeaveModule } from './leave/leave.module';
import { AbdmModule } from './abdm/abdm.module';
import { OpdModule } from './opd/opd.module';
import { IpdModule } from './ipd/ipd.module';
import { ClinicalModule } from './clinical/clinical.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { EmergencyModule } from './emergency/emergency.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { InsuranceModule } from './insurance/insurance.module';
import { SurgeryModule } from './surgery/surgery.module';
import { AuditModule } from './audit/audit.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { PlansModule } from './plans/plans.module';
import { PortalModule } from './portal/portal.module';
import { EngagementModule } from './engagement/engagement.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CommonModule } from './common/common.module';
import { JobModule } from './jobs/job.module';
import { JobSchedulerModule } from './jobs/scheduler/job-scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    JobModule,
    JobSchedulerModule,
    AuthModule,
    HospitalsModule,
    UsersModule,
    PatientsModule,
    SchedulingModule,
    BillingModule,
    AuditModule,
    ReportsModule,
    RolesModule,
    PlansModule,
    PortalModule,
    EngagementModule,
    NotificationsModule,
    AttendanceModule,
    WorkSchedulesModule,
    BookingRulesModule,
    RosterModule,
    LeaveModule,
    AbdmModule,
    OpdModule,
    IpdModule,
    ClinicalModule,
    DiagnosticsModule,
    EmergencyModule,
    PharmacyModule,
    InsuranceModule,
    SurgeryModule,
  ],
})
export class AppModule {}
