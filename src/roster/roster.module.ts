import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { RosterController } from './roster.controller';
import { RosterService } from './roster.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [RosterController],
  providers: [RosterService],
  exports: [RosterService],
})
export class RosterModule {}
