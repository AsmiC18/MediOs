import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { ReplaceRolePermissionsDto } from './dto/replace-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {
  ROLE_CREATED,
  ROLE_DELETED,
  ROLE_PERMISSION_GRANTED,
  ROLE_PERMISSION_REVOKED,
  ROLE_UPDATED,
} from './role-audit.actions';
import {
  RBAC_ADMIN_REQUIRED_PERMISSIONS,
  RbacAuthenticatedUser,
  SYSTEM_ADMIN_ROLE_NAME,
} from './role.constants';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listRoles(user: RbacAuthenticatedUser) {
    const roles = await this.prisma.role.findMany({
      where: { hospitalId: user.hospitalId },
      orderBy: { name: 'asc' },
      include: {
        permissions: {
          include: { permission: { select: { name: true } } },
        },
        _count: { select: { users: true } },
      },
    });

    return roles.map((role) => this.toRoleSummary(role));
  }

  async getRole(user: RbacAuthenticatedUser, roleId: string) {
    const role = await this.findHospitalRole(user, roleId, {
      permissions: {
        include: { permission: true },
      },
      _count: { select: { users: true } },
    });
    return this.toRoleDetail(role);
  }

  async createRole(user: RbacAuthenticatedUser, dto: CreateRoleDto) {
    const name = this.normalizeRoleName(dto.name);
    if (!name) {
      throw new BadRequestException('Role name is required');
    }

    await this.assertRoleNameAvailable(user.hospitalId, name);

    const role = await this.prisma.role.create({
      data: {
        hospitalId: user.hospitalId,
        name,
        description: dto.description?.trim() || null,
      },
    });

    await this.auditService.log({
      action: ROLE_CREATED,
      entity: 'Role',
      entityId: role.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? undefined,
      userId: user.sub,
      metadata: { roleName: role.name },
    });

    return this.getRole(user, role.id);
  }

  async updateRole(user: RbacAuthenticatedUser, roleId: string, dto: UpdateRoleDto) {
    const role = await this.findHospitalRole(user, roleId);

    if (role.name === SYSTEM_ADMIN_ROLE_NAME) {
      if (dto.name !== undefined && dto.name.trim() !== SYSTEM_ADMIN_ROLE_NAME) {
        throw new ForbiddenException('ADMIN role cannot be renamed');
      }
    }

    const data: Prisma.RoleUpdateInput = {};
    if (dto.name !== undefined) {
      const name = this.normalizeRoleName(dto.name);
      if (!name) {
        throw new BadRequestException('Role name is required');
      }
      if (name !== role.name) {
        await this.assertRoleNameAvailable(user.hospitalId, name, role.id);
      }
      data.name = name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return this.getRole(user, roleId);
    }

    await this.prisma.role.update({
      where: { id: role.id },
      data,
    });

    await this.auditService.log({
      action: ROLE_UPDATED,
      entity: 'Role',
      entityId: role.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        roleName: role.name,
        changes: Object.keys(data),
      },
    });

    return this.getRole(user, role.id);
  }

  async deleteRole(user: RbacAuthenticatedUser, roleId: string) {
    const role = await this.findHospitalRole(user, roleId, {
      _count: { select: { users: true } },
    });

    if (role.name === SYSTEM_ADMIN_ROLE_NAME) {
      throw new ForbiddenException('ADMIN role cannot be deleted');
    }

    if (role._count.users > 0) {
      throw new ConflictException('Role is assigned to users and cannot be deleted');
    }

    await this.prisma.role.delete({ where: { id: role.id } });

    await this.auditService.log({
      action: ROLE_DELETED,
      entity: 'Role',
      entityId: role.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? undefined,
      userId: user.sub,
      metadata: { roleName: role.name },
    });

    return { id: role.id, deleted: true };
  }

  async replaceRolePermissions(
    user: RbacAuthenticatedUser,
    roleId: string,
    dto: ReplaceRolePermissionsDto,
  ) {
    const role = await this.findHospitalRole(user, roleId, {
      permissions: { include: { permission: true } },
    });

    const permissionNames = this.normalizePermissionNames(dto.permissionNames);
    const permissions = await this.prisma.permission.findMany({
      where: { name: { in: permissionNames } },
    });

    if (permissions.length !== permissionNames.length) {
      const found = new Set(permissions.map((p) => p.name));
      const missing = permissionNames.filter((name) => !found.has(name));
      throw new BadRequestException(`Unknown permissions: ${missing.join(', ')}`);
    }

    if (role.name === SYSTEM_ADMIN_ROLE_NAME) {
      this.assertAdminRequiredPermissions(permissionNames);
    }

    const previousNames = role.permissions
      .map((rp) => rp.permission.name)
      .sort();

    await this.assertHospitalRetainsRbacOperator(
      user.hospitalId,
      role.id,
      permissionNames,
    );

    const granted = permissionNames.filter((name) => !previousNames.includes(name));
    const revoked = previousNames.filter((name) => !permissionNames.includes(name));

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });

      for (const permissionName of granted) {
        await this.auditService.logInTransaction(tx, {
          action: ROLE_PERMISSION_GRANTED,
          entity: 'Role',
          entityId: role.id,
          hospitalId: user.hospitalId,
          branchId: user.branchId ?? undefined,
          userId: user.sub,
          metadata: { roleName: role.name, permissionName },
        });
      }
      for (const permissionName of revoked) {
        await this.auditService.logInTransaction(tx, {
          action: ROLE_PERMISSION_REVOKED,
          entity: 'Role',
          entityId: role.id,
          hospitalId: user.hospitalId,
          branchId: user.branchId ?? undefined,
          userId: user.sub,
          metadata: { roleName: role.name, permissionName },
        });
      }
    });

    return this.getRole(user, role.id);
  }

  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
    return permissions;
  }

  private normalizeRoleName(value: string): string {
    return value.trim().replace(/\s+/g, '_').toUpperCase();
  }

  private normalizePermissionNames(values: string[]): string[] {
    const normalized = values.map((v) => v.trim()).filter(Boolean);
    const unique = [...new Set(normalized)];
    if (unique.length !== normalized.length) {
      throw new BadRequestException('Duplicate permission names are not allowed');
    }
    return unique.sort();
  }

  private assertAdminRequiredPermissions(permissionNames: string[]) {
    for (const required of RBAC_ADMIN_REQUIRED_PERMISSIONS) {
      if (!permissionNames.includes(required)) {
        throw new ForbiddenException(
          `ADMIN role must retain permission ${required}`,
        );
      }
    }
  }

  private async assertRoleNameAvailable(
    hospitalId: string,
    name: string,
    excludeRoleId?: string,
  ) {
    const existing = await this.prisma.role.findUnique({
      where: { hospitalId_name: { hospitalId, name } },
    });
    if (existing && existing.id !== excludeRoleId) {
      throw new ConflictException('Role name already exists for this hospital');
    }
  }

  private async assertHospitalRetainsRbacOperator(
    hospitalId: string,
    roleIdBeingUpdated: string,
    newPermissionNamesForRole: string[],
  ) {
    const roles = await this.prisma.role.findMany({
      where: { hospitalId },
      include: {
        permissions: { include: { permission: { select: { name: true } } } },
        _count: { select: { users: true } },
      },
    });

    const roleIdsWithManage: string[] = [];
    for (const role of roles) {
      const names =
        role.id === roleIdBeingUpdated
          ? newPermissionNamesForRole
          : role.permissions.map((rp) => rp.permission.name);
      if (names.includes('roles:manage')) {
        roleIdsWithManage.push(role.id);
      }
    }

    if (roleIdsWithManage.length === 0) {
      throw new ForbiddenException(
        'At least one role must retain roles:manage for this hospital',
      );
    }

    const activeOperators = await this.prisma.user.count({
      where: {
        hospitalId,
        status: 'ACTIVE',
        roleId: { in: roleIdsWithManage },
      },
    });

    if (activeOperators === 0) {
      throw new ForbiddenException(
        'At least one active user must be assigned to a role with roles:manage',
      );
    }
  }

  private async findHospitalRole(
    user: RbacAuthenticatedUser,
    roleId: string,
  ): Promise<Role>;
  private async findHospitalRole<T extends Prisma.RoleInclude>(
    user: RbacAuthenticatedUser,
    roleId: string,
    include: T,
  ): Promise<Prisma.RoleGetPayload<{ include: T }>>;
  private async findHospitalRole<T extends Prisma.RoleInclude>(
    user: RbacAuthenticatedUser,
    roleId: string,
    include?: T,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, hospitalId: user.hospitalId },
      include,
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  private toRoleSummary(
    role: Prisma.RoleGetPayload<{
      include: {
        permissions: { include: { permission: { select: { name: true } } } };
        _count: { select: { users: true } };
      };
    }>,
  ) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissionNames: role.permissions
        .map((rp) => rp.permission.name)
        .sort(),
      userCount: role._count.users,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  private toRoleDetail(
    role: Prisma.RoleGetPayload<{
      include: {
        permissions: { include: { permission: true } };
        _count: { select: { users: true } };
      };
    }>,
  ) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      userCount: role._count.users,
      permissions: role.permissions
        .map((rp) => ({
          id: rp.permission.id,
          name: rp.permission.name,
          description: rp.permission.description,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }
}
