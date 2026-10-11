import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  PatientNpsCategory,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { PatientPrincipal } from '../portal/portal.types';
import { SubmitPatientNpsDto } from './dto/submit-patient-nps.dto';
import { NpsQueryDto } from './dto/nps-query.dto';
import {
  NPS_DETRACTOR_FLAGGED,
  NPS_RESPONSE_CREATED,
} from './patient-engagement-audit.actions';
import { MAX_NPS_COMMENT_LENGTH } from './patient-engagement.constants';
import {
  calculateNpsScoreFromCounts,
  deriveNpsCategoryFromScore,
} from './patient-nps-category.util';
import { PatientEngagementActionService } from './patient-engagement-action.service';

type StaffUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class PatientNpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly engagementActionService: PatientEngagementActionService,
  ) {}

  async submitForPortalPatient(
    principal: PatientPrincipal,
    appointmentId: string,
    dto: SubmitPatientNpsDto,
  ) {
    this.assertValidScore(dto.score);
    const comment = this.normalizeComment(dto.comment);

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        hospitalId: principal.hospitalId,
        patientId: principal.patientId,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException('NPS is only allowed for completed visits');
    }

    const category = deriveNpsCategoryFromScore(dto.score);
    const respondedAt = new Date();

    try {
      const response = await this.prisma.patientNpsResponse.create({
        data: {
          hospitalId: principal.hospitalId,
          branchId: appointment.branchId,
          patientId: principal.patientId,
          appointmentId: appointment.id,
          score: dto.score,
          comment,
          category,
          respondedAt,
        },
      });

      await this.auditService.log({
        action: NPS_RESPONSE_CREATED,
        entity: 'PatientNpsResponse',
        entityId: response.id,
        hospitalId: principal.hospitalId,
        branchId: appointment.branchId,
        userId: undefined,
        metadata: {
          patientId: principal.patientId,
          appointmentId: appointment.id,
          category,
          score: dto.score,
          actorType: 'PATIENT_PORTAL',
        },
      });

      if (category === PatientNpsCategory.DETRACTOR) {
        await this.engagementActionService.ensureDetractorFollowUpAction({
          hospitalId: principal.hospitalId,
          branchId: appointment.branchId,
          patientId: principal.patientId,
          npsResponseId: response.id,
          appointmentId: appointment.id,
        });

        await this.auditService.log({
          action: NPS_DETRACTOR_FLAGGED,
          entity: 'PatientNpsResponse',
          entityId: response.id,
          hospitalId: principal.hospitalId,
          branchId: appointment.branchId,
          userId: undefined,
          metadata: {
            patientId: principal.patientId,
            appointmentId: appointment.id,
            score: dto.score,
          },
        });
      }

      return response;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('NPS response already submitted for visit');
      }
      throw error;
    }
  }

  async listForStaff(user: StaffUser, query: NpsQueryDto) {
    const where: Prisma.PatientNpsResponseWhereInput = {
      hospitalId: user.hospitalId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
    };

    applyBranchScope(user, where);

    if (query.branchId) {
      assertBranchAccess(user, query.branchId);
      where.branchId = query.branchId;
    }

    if (query.startAt || query.endAt) {
      where.respondedAt = {};
      if (query.startAt) {
        where.respondedAt.gte = new Date(query.startAt);
      }
      if (query.endAt) {
        where.respondedAt.lte = new Date(query.endAt);
      }
    }

    return this.prisma.patientNpsResponse.findMany({
      where,
      orderBy: [{ respondedAt: 'desc' }, { id: 'desc' }],
      take: query.limit ?? 50,
    });
  }

  async getByIdForStaff(user: StaffUser, id: string) {
    const row = await this.prisma.patientNpsResponse.findFirst({
      where: { id, hospitalId: user.hospitalId },
    });
    if (!row) {
      throw new NotFoundException('NPS response not found');
    }
    if (row.branchId != null) {
      assertBranchAccess(user, row.branchId);
    }
    return row;
  }

  async summaryForStaff(user: StaffUser, query: NpsQueryDto) {
    const where: Prisma.PatientNpsResponseWhereInput = {
      hospitalId: user.hospitalId,
    };

    applyBranchScope(user, where);

    if (query.branchId) {
      assertBranchAccess(user, query.branchId);
      where.branchId = query.branchId;
    }

    if (query.startAt || query.endAt) {
      where.respondedAt = {};
      if (query.startAt) {
        where.respondedAt.gte = new Date(query.startAt);
      }
      if (query.endAt) {
        where.respondedAt.lte = new Date(query.endAt);
      }
    }

    const [promoterCount, passiveCount, detractorCount] = await Promise.all([
      this.prisma.patientNpsResponse.count({
        where: { ...where, category: PatientNpsCategory.PROMOTER },
      }),
      this.prisma.patientNpsResponse.count({
        where: { ...where, category: PatientNpsCategory.PASSIVE },
      }),
      this.prisma.patientNpsResponse.count({
        where: { ...where, category: PatientNpsCategory.DETRACTOR },
      }),
    ]);

    const totalResponses = promoterCount + passiveCount + detractorCount;

    return {
      totalResponses,
      promoterCount,
      passiveCount,
      detractorCount,
      npsScore: calculateNpsScoreFromCounts({
        promoterCount,
        passiveCount,
        detractorCount,
      }),
    };
  }

  private assertValidScore(score: number): void {
    if (!Number.isInteger(score) || score < 0 || score > 10) {
      throw new BadRequestException('Score must be an integer from 0 to 10');
    }
  }

  private normalizeComment(comment?: string): string | null {
    if (comment == null || comment.trim() === '') {
      return null;
    }
    const trimmed = comment.trim();
    if (trimmed.length > MAX_NPS_COMMENT_LENGTH) {
      throw new BadRequestException(
        `Comment must be at most ${MAX_NPS_COMMENT_LENGTH} characters`,
      );
    }
    return trimmed;
  }
}
