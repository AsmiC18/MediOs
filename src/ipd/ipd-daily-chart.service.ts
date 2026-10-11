import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IpdDailyChartEntryType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateIpdDailyChartEntryDto } from './dto/ipd-daily-chart.dto';

type StaffUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const IPD_CHART_ENTRY_CREATE = 'IPD_DAILY_CHART_ENTRY_CREATE';

@Injectable()
export class IpdDailyChartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listChart(user: StaffUser, admissionId: string) {
    const admission = await this.findOwnedAdmission(user, admissionId);
    const entries = await this.prisma.ipdDailyChartEntry.findMany({
      where: { hospitalId: user.hospitalId, admissionId: admission.id },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return { admissionId: admission.id, entries };
  }

  async addEntry(user: StaffUser, admissionId: string, dto: CreateIpdDailyChartEntryDto) {
    const admission = await this.findOwnedAdmission(user, admissionId);

    if (dto.entryType === IpdDailyChartEntryType.VITAL && !dto.vitalsJson) {
      throw new BadRequestException('vitalsJson is required for VITAL entries');
    }
    if (dto.entryType === IpdDailyChartEntryType.NOTE && !dto.noteText?.trim()) {
      throw new BadRequestException('noteText is required for NOTE entries');
    }

    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();

    const row = await this.prisma.ipdDailyChartEntry.create({
      data: {
        hospitalId: admission.hospitalId,
        branchId: admission.branchId,
        admissionId: admission.id,
        entryType: dto.entryType,
        recordedAt,
        vitalsJson:
          dto.entryType === IpdDailyChartEntryType.VITAL
            ? (dto.vitalsJson as Prisma.InputJsonValue)
            : undefined,
        noteText:
          dto.entryType === IpdDailyChartEntryType.NOTE
            ? dto.noteText!.trim()
            : undefined,
        recordedByUserId: user.sub,
      },
    });

    await this.auditService.log({
      action: IPD_CHART_ENTRY_CREATE,
      entity: 'IpdDailyChartEntry',
      entityId: row.id,
      hospitalId: user.hospitalId,
      branchId: admission.branchId,
      userId: user.sub,
      metadata: { admissionId: admission.id, entryType: row.entryType },
    });

    return row;
  }

  private async findOwnedAdmission(user: StaffUser, admissionId: string) {
    const admission = await this.prisma.ipdAdmission.findFirst({
      where: { id: admissionId, hospitalId: user.hospitalId },
    });
    if (!admission) {
      throw new NotFoundException('Admission not found');
    }
    if (admission.branchId) {
      assertBranchAccess(user, admission.branchId);
    }
    return admission;
  }
}
