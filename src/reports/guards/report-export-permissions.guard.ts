import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReportExportType } from '../dto/report-export.dto';

@Injectable()
export class ReportExportPermissionsGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException();
    }

    const type = request.body?.type as ReportExportType | undefined;
    const requiredPermission =
      type === ReportExportType.INSURANCE_AGEING
        ? 'insurance:reports:export'
        : 'reports:export';

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId: user.roleId,
        permission: { name: requiredPermission },
      },
    });

    if (rolePermissions.length === 0) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
