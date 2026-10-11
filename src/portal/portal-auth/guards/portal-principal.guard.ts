import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { loadActivePortalPatient } from '../../portal-patient-access.util';
import { PatientPrincipal } from '../../portal.types';

@Injectable()
export class PortalPrincipalGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: PatientPrincipal }>();
    const principal = request.user;

    if (!principal || principal.principalType !== 'PATIENT') {
      throw new UnauthorizedException();
    }

    try {
      await loadActivePortalPatient(
        this.prisma,
        principal.patientId,
        principal.hospitalId,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new ForbiddenException('Invalid credentials');
      }
      throw error;
    }

    const account = await this.prisma.patientPortalAccount.findUnique({
      where: { patientId: principal.patientId },
    });
    if (!account || account.status !== 'ACTIVE') {
      throw new ForbiddenException('Invalid credentials');
    }

    return true;
  }
}
