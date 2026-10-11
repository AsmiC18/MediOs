import { Injectable, NotFoundException } from '@nestjs/common';
import { HospitalDepartmentKey } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { TOGGLEABLE_DEPARTMENT_KEYS } from './hospital-department-keys.util';

@Injectable()
export class HospitalDepartmentToggleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async isDepartmentEnabled(
    hospitalId: string,
    departmentKey: HospitalDepartmentKey,
  ): Promise<boolean> {
    const row = await this.prisma.hospitalDepartmentToggle.findUnique({
      where: {
        hospitalId_departmentKey: { hospitalId, departmentKey },
      },
    });
    if (!row) {
      return true;
    }
    return row.enabled;
  }

  async listForHospital(hospitalId: string) {
    const rows = await this.prisma.hospitalDepartmentToggle.findMany({
      where: { hospitalId },
    });
    const map = new Map(rows.map((r) => [r.departmentKey, r.enabled]));
    return TOGGLEABLE_DEPARTMENT_KEYS.map((departmentKey) => ({
      departmentKey,
      enabled: map.get(departmentKey) ?? true,
    }));
  }

  async setToggle(
    user: { sub: string; hospitalId: string },
    departmentKey: HospitalDepartmentKey,
    enabled: boolean,
  ) {
    if (!TOGGLEABLE_DEPARTMENT_KEYS.includes(departmentKey)) {
      throw new NotFoundException('Unknown department key');
    }

    const row = await this.prisma.hospitalDepartmentToggle.upsert({
      where: {
        hospitalId_departmentKey: {
          hospitalId: user.hospitalId,
          departmentKey,
        },
      },
      update: {
        enabled,
        updatedByUserId: user.sub,
      },
      create: {
        hospitalId: user.hospitalId,
        departmentKey,
        enabled,
        updatedByUserId: user.sub,
      },
    });

    await this.auditService.log({
      action: 'HOSPITAL_DEPARTMENT_TOGGLE_UPDATED',
      entity: 'HospitalDepartmentToggle',
      entityId: row.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
      metadata: { departmentKey, enabled },
    });

    return row;
  }
}
