import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { USER_BRANCH_ASSIGNED } from '../hospitals/tenant-audit.actions';
import { USER_ROLE_ASSIGNED } from '../roles/role-audit.actions';
import { RbacAuthenticatedUser } from '../roles/role.constants';
import { AssignUserBranchDto } from './dto/assign-user-branch.dto';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async assignRole(
    actor: RbacAuthenticatedUser,
    userId: string,
    dto: AssignUserRoleDto,
  ) {
    const targetUser = await this.prisma.user.findFirst({
      where: { id: userId, hospitalId: actor.hospitalId },
      include: { role: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const newRole = await this.prisma.role.findFirst({
      where: { id: dto.roleId, hospitalId: actor.hospitalId },
    });

    if (!newRole) {
      throw new NotFoundException('Role not found');
    }

    if (targetUser.roleId === newRole.id) {
      return {
        id: targetUser.id,
        roleId: targetUser.roleId,
        roleName: newRole.name,
      };
    }

    await this.assertHospitalRetainsRbacOperatorAfterUserRoleChange(
      actor.hospitalId,
      targetUser.id,
      targetUser.roleId,
      newRole.id,
    );

    const previousRoleId = targetUser.roleId;

    await this.prisma.user.update({
      where: { id: targetUser.id },
      data: { roleId: newRole.id },
    });

    await this.auditService.log({
      action: USER_ROLE_ASSIGNED,
      entity: 'User',
      entityId: targetUser.id,
      hospitalId: actor.hospitalId,
      branchId: actor.branchId ?? undefined,
      userId: actor.sub,
      metadata: {
        previousRoleId,
        newRoleId: newRole.id,
        newRoleName: newRole.name,
      },
    });

    return {
      id: targetUser.id,
      roleId: newRole.id,
      roleName: newRole.name,
    };
  }

  async assignBranch(
    actor: RbacAuthenticatedUser,
    userId: string,
    dto: AssignUserBranchDto,
  ) {
    const targetUser = await this.prisma.user.findFirst({
      where: { id: userId, hospitalId: actor.hospitalId },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const actorBranchId = actor.branchId ?? null;
    const nextBranchId =
      dto.branchId === undefined ? targetUser.branchId : dto.branchId;

    if (actorBranchId !== null) {
      if (targetUser.branchId !== actorBranchId) {
        throw new ForbiddenException(
          'Cannot change branch assignment for users outside your branch',
        );
      }
      if (nextBranchId !== null && nextBranchId !== actorBranchId) {
        throw new ForbiddenException(
          'Branch-scoped administrators can only assign their own branch',
        );
      }
    }

    if (nextBranchId === targetUser.branchId) {
      return {
        id: targetUser.id,
        branchId: targetUser.branchId,
      };
    }

    if (nextBranchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: nextBranchId,
          hospitalId: actor.hospitalId,
        },
      });

      if (!branch) {
        throw new NotFoundException('Branch not found');
      }

      if (!branch.isActive) {
        throw new BadRequestException('Cannot assign an inactive branch');
      }
    }

    const previousBranchId = targetUser.branchId;

    await this.prisma.user.update({
      where: { id: targetUser.id },
      data: { branchId: nextBranchId },
    });

    await this.auditService.log({
      action: USER_BRANCH_ASSIGNED,
      entity: 'User',
      entityId: targetUser.id,
      hospitalId: actor.hospitalId,
      branchId: actor.branchId ?? undefined,
      userId: actor.sub,
      metadata: {
        previousBranchId,
        newBranchId: nextBranchId,
      },
    });

    return {
      id: targetUser.id,
      branchId: nextBranchId,
    };
  }

  private async roleHasPermission(roleId: string, permissionName: string) {
    const link = await this.prisma.rolePermission.findFirst({
      where: {
        roleId,
        permission: { name: permissionName },
      },
    });
    return link != null;
  }

  private async assertHospitalRetainsRbacOperatorAfterUserRoleChange(
    hospitalId: string,
    targetUserId: string,
    previousRoleId: string,
    newRoleId: string,
  ) {
    const previousHadManage = await this.roleHasPermission(
      previousRoleId,
      'roles:manage',
    );
    const newHasManage = await this.roleHasPermission(newRoleId, 'roles:manage');

    if (previousHadManage && !newHasManage) {
      const manageRoleIds = (
        await this.prisma.rolePermission.findMany({
          where: {
            permission: { name: 'roles:manage' },
            role: { hospitalId },
          },
          select: { roleId: true },
        })
      ).map((row) => row.roleId);

      const remainingOperators = await this.prisma.user.count({
        where: {
          hospitalId,
          status: 'ACTIVE',
          id: { not: targetUserId },
          roleId: { in: manageRoleIds },
        },
      });

      if (remainingOperators === 0) {
        throw new ConflictException(
          'Cannot reassign the last active RBAC administrator',
        );
      }
    }
  }
}
