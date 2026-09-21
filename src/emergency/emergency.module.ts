import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { EmergencyVisitController } from './emergency-visit.controller';
import { EmergencyService } from './emergency.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [EmergencyVisitController],
  providers: [EmergencyService],
  exports: [EmergencyService],
})
export class EmergencyModule {}
