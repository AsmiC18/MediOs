import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Patient, Prisma } from '@prisma/client';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  PatientTimelineCategory,
  PatientTimelineQueryDto,
} from './dto/patient-timeline-query.dto';
import {
  PATIENT_TIMELINE_EVENT,
  PatientTimelineItemResponse,
  PatientTimelineResponse,
} from './patient-timeline.types';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

@Injectable()
export class PatientTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async validateBranch(user: AuthenticatedUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Branch does not belong to your hospital');
    }
  }

  private async findOwnedPatient(
    user: AuthenticatedUser,
    patientId: string,
  ): Promise<Patient> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    assertBranchAccess(user, patient.branchId);

    return patient;
  }

  private resolveOccurredRange(query: PatientTimelineQueryDto): {
    gte?: Date;
    lte?: Date;
  } | undefined {
    if (!query.from && !query.to) {
      return undefined;
    }

    const range: { gte?: Date; lte?: Date } = {};
    if (query.from) {
      range.gte = new Date(query.from);
    }
    if (query.to) {
      range.lte = new Date(query.to);
    }
    return range;
  }

  private eventBranchFilter(
    user: AuthenticatedUser,
    query: PatientTimelineQueryDto,
  ): string | null | undefined {
    if (user.branchId != null) {
      return user.branchId;
    }
    return query.branchId;
  }

  private branchWhere(
    user: AuthenticatedUser,
    query: PatientTimelineQueryDto,
  ): Prisma.AppointmentWhereInput {
    const base: Prisma.AppointmentWhereInput = {
      hospitalId: user.hospitalId,
    };

    const effectiveBranchId = this.eventBranchFilter(user, query);
    return applyBranchScope(user, {
      ...base,
      ...(effectiveBranchId && user.branchId == null
        ? { branchId: effectiveBranchId }
        : {}),
    });
  }

  private filterItemByBranch(
    user: AuthenticatedUser,
    branchId: string | null,
  ): boolean {
    const userBranchId = user.branchId ?? null;
    if (userBranchId === null) {
      return true;
    }
    return branchId == null || branchId === userBranchId;
  }

  private filterByOccurredAt(
    occurredAt: Date,
    range: { gte?: Date; lte?: Date } | undefined,
  ): boolean {
    if (!range) {
      return true;
    }
    const t = occurredAt.getTime();
    if (range.gte && t < range.gte.getTime()) {
      return false;
    }
    if (range.lte && t > range.lte.getTime()) {
      return false;
    }
    return true;
  }

  private async loadAppointmentEvents(
    user: AuthenticatedUser,
    patientId: string,
    query: PatientTimelineQueryDto,
    range: { gte?: Date; lte?: Date } | undefined,
  ): Promise<PatientTimelineItemResponse[]> {
    const where = {
      ...this.branchWhere(user, query),
      patientId,
      ...(range?.gte || range?.lte
        ? {
            startAt: {
              ...(range.gte ? { gte: range.gte } : {}),
              ...(range.lte ? { lte: range.lte } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.appointment.findMany({
      where,
      select: {
        id: true,
        branchId: true,
        startAt: true,
        endAt: true,
        status: true,
      },
    });

    return rows
      .filter((row) => this.filterItemByBranch(user, row.branchId))
      .map((row) => ({
        eventType: PATIENT_TIMELINE_EVENT.APPOINTMENT_SCHEDULED,
        occurredAt: row.startAt.toISOString(),
        entityId: row.id,
        branchId: row.branchId,
        summary: {
          status: row.status,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
        },
      }));
  }

  private async loadPrescriptionEvents(
    user: AuthenticatedUser,
    patientId: string,
    query: PatientTimelineQueryDto,
    range: { gte?: Date; lte?: Date } | undefined,
  ): Promise<PatientTimelineItemResponse[]> {
    const encounterBranchFilter = user.branchId
      ? { branchId: user.branchId }
      : query.branchId
        ? { branchId: query.branchId }
        : {};

    const rows = await this.prisma.prescription.findMany({
      where: {
        hospitalId: user.hospitalId,
        patientId,
        encounter: encounterBranchFilter,
        ...(range?.gte || range?.lte
          ? {
              createdAt: {
                ...(range.gte ? { gte: range.gte } : {}),
                ...(range.lte ? { lte: range.lte } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        encounterId: true,
        encounter: { select: { branchId: true } },
      },
    });

    return rows
      .filter((row) =>
        this.filterItemByBranch(user, row.encounter.branchId),
      )
      .map((row) => ({
        eventType: PATIENT_TIMELINE_EVENT.PRESCRIPTION_CREATED,
        occurredAt: row.createdAt.toISOString(),
        entityId: row.id,
        branchId: row.encounter.branchId,
        summary: {
          status: row.status,
          encounterId: row.encounterId,
        },
      }));
  }

  private async loadInvoiceEvents(
    user: AuthenticatedUser,
    patientId: string,
    query: PatientTimelineQueryDto,
    range: { gte?: Date; lte?: Date } | undefined,
  ): Promise<PatientTimelineItemResponse[]> {
    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      patientId,
      ...(user.branchId == null && query.branchId
        ? { branchId: query.branchId }
        : {}),
    });

    const rows = await this.prisma.invoice.findMany({
      where,
      select: {
        id: true,
        branchId: true,
        status: true,
        invoiceNumber: true,
        totalAmount: true,
        issuedAt: true,
        createdAt: true,
      },
    });

    return rows
      .filter((row) => this.filterItemByBranch(user, row.branchId))
      .filter((row) => {
        const occurredAt = row.issuedAt ?? row.createdAt;
        return this.filterByOccurredAt(occurredAt, range);
      })
      .map((row) => {
        const occurredAt = row.issuedAt ?? row.createdAt;
        return {
          eventType: PATIENT_TIMELINE_EVENT.INVOICE_ISSUED,
          occurredAt: occurredAt.toISOString(),
          entityId: row.id,
          branchId: row.branchId,
          summary: {
            status: row.status,
            invoiceNumber: row.invoiceNumber,
            totalAmount: row.totalAmount.toFixed(2),
          },
        };
      });
  }

  private async loadDiagnosticEvents(
    user: AuthenticatedUser,
    patientId: string,
    query: PatientTimelineQueryDto,
    range: { gte?: Date; lte?: Date } | undefined,
  ): Promise<PatientTimelineItemResponse[]> {
    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      patientId,
      ...(user.branchId == null && query.branchId
        ? { branchId: query.branchId }
        : {}),
    });

    const rows = await this.prisma.diagnosticOrder.findMany({
      where,
      select: {
        id: true,
        branchId: true,
        status: true,
        orderNumber: true,
        priority: true,
        orderedAt: true,
        createdAt: true,
      },
    });

    return rows
      .filter((row) => this.filterItemByBranch(user, row.branchId))
      .filter((row) => {
        const occurredAt = row.orderedAt ?? row.createdAt;
        return this.filterByOccurredAt(occurredAt, range);
      })
      .map((row) => {
        const occurredAt = row.orderedAt ?? row.createdAt;
        return {
          eventType: PATIENT_TIMELINE_EVENT.DIAGNOSTIC_ORDERED,
          occurredAt: occurredAt.toISOString(),
          entityId: row.id,
          branchId: row.branchId,
          summary: {
            status: row.status,
            orderNumber: row.orderNumber,
            priority: row.priority,
          },
        };
      });
  }

  private async loadInsuranceClaimEvents(
    user: AuthenticatedUser,
    patientId: string,
    query: PatientTimelineQueryDto,
    range: { gte?: Date; lte?: Date } | undefined,
  ): Promise<PatientTimelineItemResponse[]> {
    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      patientId,
      ...(user.branchId == null && query.branchId
        ? { branchId: query.branchId }
        : {}),
    });

    const rows = await this.prisma.insuranceClaim.findMany({
      where,
      select: {
        id: true,
        branchId: true,
        status: true,
        claimNumber: true,
        claimedAmount: true,
        submittedAt: true,
        createdAt: true,
      },
    });

    return rows
      .filter((row) => this.filterItemByBranch(user, row.branchId))
      .filter((row) => {
        const occurredAt = row.submittedAt ?? row.createdAt;
        return this.filterByOccurredAt(occurredAt, range);
      })
      .map((row) => {
        const occurredAt = row.submittedAt ?? row.createdAt;
        return {
          eventType: PATIENT_TIMELINE_EVENT.INSURANCE_CLAIM_SUBMITTED,
          occurredAt: occurredAt.toISOString(),
          entityId: row.id,
          branchId: row.branchId,
          summary: {
            status: row.status,
            claimNumber: row.claimNumber,
            claimedAmount: row.claimedAmount.toFixed(2),
          },
        };
      });
  }

  async getTimeline(
    user: AuthenticatedUser,
    patientId: string,
    query: PatientTimelineQueryDto = {},
  ): Promise<PatientTimelineResponse> {
    await this.findOwnedPatient(user, patientId);

    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const range = this.resolveOccurredRange(query);

    const loaders: Array<() => Promise<PatientTimelineItemResponse[]>> = [];

    const includeCategory = (category: PatientTimelineCategory) =>
      !query.category || query.category === category;

    if (includeCategory(PatientTimelineCategory.APPOINTMENT)) {
      loaders.push(() =>
        this.loadAppointmentEvents(user, patientId, query, range),
      );
    }
    if (includeCategory(PatientTimelineCategory.PRESCRIPTION)) {
      loaders.push(() =>
        this.loadPrescriptionEvents(user, patientId, query, range),
      );
    }
    if (includeCategory(PatientTimelineCategory.INVOICE)) {
      loaders.push(() =>
        this.loadInvoiceEvents(user, patientId, query, range),
      );
    }
    if (includeCategory(PatientTimelineCategory.DIAGNOSTIC)) {
      loaders.push(() =>
        this.loadDiagnosticEvents(user, patientId, query, range),
      );
    }
    if (includeCategory(PatientTimelineCategory.INSURANCE_CLAIM)) {
      loaders.push(() =>
        this.loadInsuranceClaimEvents(user, patientId, query, range),
      );
    }

    const chunks = await Promise.all(loaders.map((load) => load()));
    const merged = chunks.flat();

    merged.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    const total = merged.length;
    const start = (page - 1) * limit;
    const data = merged.slice(start, start + limit);

    await this.auditService.log({
      action: 'PATIENT_TIMELINE_READ',
      entity: 'Patient',
      entityId: patientId,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? query.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        patientId,
        page,
        limit,
        category: query.category ?? null,
        resultCount: data.length,
        total,
      },
    });

    return {
      patientId,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }
}
