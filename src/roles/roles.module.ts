import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { RoleBootstrapService } from './role-bootstrap.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [CommonModule, AuthModule, AuditModule],
  controllers: [RolesController],
  providers: [RolesService, RoleBootstrapService],
  exports: [RolesService, RoleBootstrapService],
})
export class RolesModule {}
