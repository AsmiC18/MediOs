import {
  Body,
  Controller,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RbacAuthenticatedUser } from '../roles/role.constants';
import { AssignUserBranchDto } from './dto/assign-user-branch.dto';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch(':id/role')
  @RequirePermissions('users:manage')
  assignRole(
    @Request() req: { user: RbacAuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: AssignUserRoleDto,
  ) {
    return this.usersService.assignRole(req.user, id, dto);
  }

  @Patch(':id/branch')
  @RequirePermissions('users:manage')
  assignBranch(
    @Request() req: { user: RbacAuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: AssignUserBranchDto,
  ) {
    return this.usersService.assignBranch(req.user, id, dto);
  }
}
