import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { BillingModule } from './billing/billing.module';
import { AttendanceModule } from './attendance/attendance.module';
import { WorkSchedulesModule } from './work-schedules/work-schedules.module';
import { BookingRulesModule } from './booking-rules/booking-rules.module';
import { RosterModule } from './roster/roster.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
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
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    SchedulingModule,
    BillingModule,
    AuditModule,
    AttendanceModule,
    WorkSchedulesModule,
    BookingRulesModule,
    RosterModule,
    WhatsAppModule,
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
