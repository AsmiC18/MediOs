import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [CommonModule, AuthModule, AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
