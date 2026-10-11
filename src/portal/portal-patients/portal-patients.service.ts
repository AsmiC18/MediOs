import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PatientPrincipal } from '../portal.types';

@Injectable()
export class PortalPatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(principal: PatientPrincipal) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: principal.patientId,
        hospitalId: principal.hospitalId,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    if (!patient || patient.anonymizedAt || patient.mergedIntoPatientId) {
      throw new NotFoundException('Not found');
    }

    return {
      id: patient.id,
      hospitalId: patient.hospitalId,
      branch: patient.branch
        ? {
            id: patient.branch.id,
            name: patient.branch.name,
            code: patient.branch.code,
          }
        : null,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      email: patient.email,
      dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
      gender: patient.gender,
    };
  }
}
