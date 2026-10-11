import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateRoleDto } from './dto/create-role.dto';
import { ReplaceRolePermissionsDto } from './dto/replace-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RbacAuthenticatedUser } from './role.constants';
import { RolesService } from './roles.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @RequirePermissions('roles:read')
  listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Get('roles')
  @RequirePermissions('roles:read')
  listRoles(@Request() req: { user: RbacAuthenticatedUser }) {
    return this.rolesService.listRoles(req.user);
  }

  @Get('roles/:id')
  @RequirePermissions('roles:read')
  getRole(
    @Request() req: { user: RbacAuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.rolesService.getRole(req.user, id);
  }

  @Post('roles')
  @RequirePermissions('roles:manage')
  createRole(
    @Request() req: { user: RbacAuthenticatedUser },
    @Body() dto: CreateRoleDto,
  ) {
    return this.rolesService.createRole(req.user, dto);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles:manage')
  updateRole(
    @Request() req: { user: RbacAuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.updateRole(req.user, id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles:manage')
  deleteRole(
    @Request() req: { user: RbacAuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.rolesService.deleteRole(req.user, id);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('roles:manage')
  replacePermissions(
    @Request() req: { user: RbacAuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: ReplaceRolePermissionsDto,
  ) {
    return this.rolesService.replaceRolePermissions(req.user, id, dto);
  }
}
