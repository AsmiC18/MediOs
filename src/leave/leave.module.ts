import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
