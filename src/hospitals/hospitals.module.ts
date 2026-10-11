import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { HospitalsController } from './hospitals.controller';
import { HospitalsService } from './hospitals.service';

@Module({
  imports: [CommonModule, AuthModule, AuditModule],
  controllers: [HospitalsController],
  providers: [HospitalsService],
  exports: [HospitalsService],
})
export class HospitalsModule {}
