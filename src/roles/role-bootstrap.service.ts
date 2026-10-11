import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  bootstrapHospitalRoleCatalogue,
  RoleBootstrapResult,
} from './role-bootstrap.util';

@Injectable()
export class RoleBootstrapService {
  constructor(private readonly prisma: PrismaService) {}

  bootstrapHospital(hospitalId: string): Promise<RoleBootstrapResult> {
    return bootstrapHospitalRoleCatalogue(this.prisma, hospitalId);
  }
}
