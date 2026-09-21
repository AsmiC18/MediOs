import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { BookingRulesController } from './booking-rules.controller';
import { BookingRulesService } from './booking-rules.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [BookingRulesController],
  providers: [BookingRulesService],
  exports: [BookingRulesService],
})
export class BookingRulesModule {}
