import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      throw new ForbiddenException(
        'Route requires @RequirePermissions when PermissionsGuard is applied',
      );
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException();
    }

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId: user.roleId,
        permission: {
          name: {
            in: requiredPermissions,
          },
        },
      },
      include: {
        permission: true,
      },
    });

    const userPermissions = new Set(
      rolePermissions.map((rolePermission) => rolePermission.permission.name),
    );

    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
