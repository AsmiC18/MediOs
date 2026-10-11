import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PatientAtRiskStatus,
  PatientWinbackCampaignStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { WINBACK_REQUESTED } from './patient-engagement-audit.actions';
import { RequestWinbackDto } from './dto/request-winback.dto';

type StaffUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class PatientWinbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly jobService: JobService,
  ) {}

  async requestWinback(user: StaffUser, dto: RequestWinbackDto) {
    const branchId = dto.branchId ?? user.branchId ?? null;
    if (branchId) {
      assertBranchAccess(user, branchId);
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, hospitalId: user.hospitalId },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    const idempotencyKey =
      dto.idempotencyKey?.trim() ||
      `winback:${user.hospitalId}:${branchId ?? 'all'}:${user.sub}:${Date.now()}`;

    let campaign;
    try {
      campaign = await this.prisma.patientWinbackCampaign.create({
        data: {
          hospitalId: user.hospitalId,
          branchId,
          requestedByUserId: user.sub,
          status: PatientWinbackCampaignStatus.PENDING,
          idempotencyKey,
          metadata: { requestedVia: 'staff_api' },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        campaign = await this.prisma.patientWinbackCampaign.findFirstOrThrow({
          where: {
            hospitalId: user.hospitalId,
            idempotencyKey,
          },
        });
        return campaign;
      }
      throw error;
    }

    await this.jobService.enqueue({
      hospitalId: user.hospitalId,
      branchId,
      type: JOB_TYPES.PATIENT_WINBACK,
      idempotencyKey: `${JOB_TYPES.PATIENT_WINBACK}:${campaign.id}`,
      payload: { campaignId: campaign.id },
      maxAttempts: 5,
    });

    await this.auditService.log({
      action: WINBACK_REQUESTED,
      entity: 'PatientWinbackCampaign',
      entityId: campaign.id,
      hospitalId: user.hospitalId,
      branchId,
      userId: user.sub,
      metadata: { branchId },
    });

    return campaign;
  }

  async previewEligibleSegment(user: StaffUser, branchId?: string | null) {
    const effectiveBranchId = branchId ?? user.branchId ?? null;
    if (effectiveBranchId) {
      assertBranchAccess(user, effectiveBranchId);
    }

    const patientIds = await this.resolveLapsedPatientIds({
      hospitalId: user.hospitalId,
      branchId: effectiveBranchId,
    });

    await this.auditService.log({
      action: 'ENGAGEMENT_WINBACK_SEGMENT_PREVIEW',
      entity: 'PatientWinbackCampaign',
      entityId: null,
      hospitalId: user.hospitalId,
      branchId: effectiveBranchId,
      userId: user.sub,
      metadata: {
        eligibleCount: patientIds.length,
        segment: 'at_risk_lapsed',
      },
    });

    return {
      segment: 'at_risk_lapsed' as const,
      branchId: effectiveBranchId,
      eligiblePatientCount: patientIds.length,
    };
  }

  async resolveLapsedPatientIds(input: {
    hospitalId: string;
    branchId?: string | null;
  }): Promise<string[]> {
    const where: Prisma.PatientWhereInput = {
      hospitalId: input.hospitalId,
      mergedIntoPatientId: null,
      anonymizedAt: null,
      isAtRisk: true,
      atRiskStatus: PatientAtRiskStatus.AT_RISK,
    };

    if (input.branchId) {
      where.branchId = input.branchId;
    }

    const rows = await this.prisma.patient.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => row.id);
  }
}
