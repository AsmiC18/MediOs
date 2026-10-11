import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  Patient,
  PatientAtRiskStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  canonicalizePatientPhone,
  tryCanonicalizePatientPhone,
} from '../common/utils/phone.util';
import { CreatePatientDto } from './dto/create-patient.dto';
import { EvaluateAtRiskDto } from './dto/evaluate-at-risk.dto';
import { PatientQueryDto } from './dto/patient-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import {
  PATIENT_LIST_SELECT,
  PatientListResponse,
} from './patient-list.types';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';
import { UpdatePatientNotificationPreferenceDto } from './dto/update-patient-notification-preference.dto';
import {
  computePatientAtRiskEvaluation,
  DEFAULT_AT_RISK_CADENCE_MULTIPLIER,
} from './patient-at-risk-evaluation.util';
import { SystemJobExecutionContext } from '../jobs/system-job.types';
import {
  assertPatientMergePreconditions,
  reassignPatientOwnedRecords,
} from './utils/patient-merge-reassign.util';
import { PatientEngagementActionService } from '../engagement/patient-engagement-action.service';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const MEDICAL_HISTORY_FIELDS = [
  'allergies',
  'chronicConditions',
  'emergencyContacts',
] as const;

type MedicalHistoryField = (typeof MEDICAL_HISTORY_FIELDS)[number];

const PATIENT_AT_RISK_EVALUATE_BATCH_SIZE = 100;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly patientNotificationPreferenceService: PatientNotificationPreferenceService,
    private readonly patientEngagementActionService: PatientEngagementActionService,
  ) {}

  private async validateBranch(
    user: AuthenticatedUser,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: {
        id: branchId,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        'Branch does not belong to your hospital',
      );
    }
  }

  private async findOwnedPatient(
    user: AuthenticatedUser,
    patientId: string,
  ): Promise<Patient> {
    const patient = await this.prisma.patient.findUnique({
      where: {
        id: patientId,
      },
    });

    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    assertBranchAccess(user, patient.branchId);

    return patient;
  }

  private resolveCreateBranchId(
    user: AuthenticatedUser,
    dtoBranchId?: string | null,
  ): string | null | undefined {
    if (user.branchId != null) {
      return user.branchId;
    }

    return dtoBranchId;
  }

  private resolveUpdateBranchId(
    user: AuthenticatedUser,
    dtoBranchId: string | null | undefined,
    currentBranchId: string | null,
  ): string | null | undefined {
    if (user.branchId != null) {
      if (dtoBranchId !== undefined && dtoBranchId !== user.branchId) {
        throw new ForbiddenException(
          'Access to this branch is not permitted',
        );
      }

      return undefined;
    }

    return dtoBranchId;
  }

  private assertPatientIsActive(patient: Patient): void {
    if (patient.mergedIntoPatientId) {
      throw new BadRequestException(
        'Patient has been merged and cannot be modified',
      );
    }
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }

  private serializeMedicalValue(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }

  private async recordMedicalFieldChanges(
    tx: Prisma.TransactionClient,
    params: {
      hospitalId: string;
      patientId: string;
      changedByUserId: string;
      before: Pick<Patient, MedicalHistoryField>;
      after: Pick<Patient, MedicalHistoryField>;
    },
  ): Promise<void> {
    for (const fieldName of MEDICAL_HISTORY_FIELDS) {
      const oldValue = params.before[fieldName];
      const newValue = params.after[fieldName];

      if (this.valuesEqual(oldValue, newValue)) {
        continue;
      }

      await tx.patientFieldHistory.create({
        data: {
          hospitalId: params.hospitalId,
          patientId: params.patientId,
          fieldName,
          oldValue: this.serializeMedicalValue(oldValue),
          newValue: this.serializeMedicalValue(newValue),
          changedByUserId: params.changedByUserId,
        },
      });
    }
  }

  private buildSearchWhere(
    hospitalId: string,
    query: PatientQueryDto,
  ): Prisma.PatientWhereInput {
    return {
      hospitalId,
      mergedIntoPatientId: null,
      ...(query.phone !== undefined && {
        phone: (() => {
          const canonical = tryCanonicalizePatientPhone(query.phone);
          return canonical
            ? { equals: canonical }
            : { contains: query.phone.replace(/\D/g, '') };
        })(),
      }),
      ...(query.firstName !== undefined && {
        firstName: {
          contains: query.firstName,
          mode: 'insensitive',
        },
      }),
      ...(query.lastName !== undefined && {
        lastName: {
          contains: query.lastName,
          mode: 'insensitive',
        },
      }),
      ...(query.email !== undefined && {
        email: {
          contains: query.email,
          mode: 'insensitive',
        },
      }),
      ...(query.gender !== undefined && { gender: query.gender }),
      ...(query.branchId !== undefined && { branchId: query.branchId }),
      ...(query.abhaId !== undefined && {
        abhaId: {
          contains: query.abhaId,
        },
      }),
      ...(query.isAtRisk !== undefined && { isAtRisk: query.isAtRisk }),
      ...(query.atRiskStatus !== undefined && {
        atRiskStatus: query.atRiskStatus,
      }),
    };
  }

  private resolveCanonicalPhone(phone: string): string {
    return canonicalizePatientPhone(phone);
  }

  async create(user: AuthenticatedUser, dto: CreatePatientDto) {
    const branchId = this.resolveCreateBranchId(user, dto.branchId);

    if (branchId) {
      await this.validateBranch(user, branchId);
    }

    const canonicalPhone = this.resolveCanonicalPhone(dto.phone);

    const existingPatient = await this.prisma.patient.findUnique({
      where: {
        hospitalId_phone: {
          hospitalId: user.hospitalId,
          phone: canonicalPhone,
        },
      },
    });

    if (existingPatient) {
      throw new ConflictException(
        'Patient with this phone number already exists',
      );
    }

    const emergencyContacts = dto.emergencyContacts ?? undefined;

    const patient = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          hospitalId: user.hospitalId,
          branchId,
          phone: canonicalPhone,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          dateOfBirth: dto.dateOfBirth
            ? new Date(dto.dateOfBirth)
            : undefined,
          gender: dto.gender,
          abhaId: dto.abhaId,
          allergies: dto.allergies ?? [],
          chronicConditions: dto.chronicConditions ?? [],
          emergencyContacts:
            emergencyContacts as unknown as Prisma.InputJsonValue,
        },
      });

      await this.recordMedicalFieldChanges(tx, {
        hospitalId: user.hospitalId,
        patientId: created.id,
        changedByUserId: user.sub,
        before: {
          allergies: [],
          chronicConditions: [],
          emergencyContacts: null,
        },
        after: {
          allergies: created.allergies,
          chronicConditions: created.chronicConditions,
          emergencyContacts: created.emergencyContacts,
        },
      });

      return created;
    });

    await this.auditService.log({
      action: 'PATIENT_CREATED',
      entity: 'Patient',
      entityId: patient.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
    });

    return patient;
  }

  async findDuplicateCandidates(
    user: AuthenticatedUser,
    query: { phone?: string; name?: string },
  ) {
    if (!query.phone?.trim() && !query.name?.trim()) {
      throw new BadRequestException(
        'Provide phone (min 3 chars) and/or name (min 2 chars) for duplicate discovery',
      );
    }

    const where: Prisma.PatientWhereInput = {
      hospitalId: user.hospitalId,
      mergedIntoPatientId: null,
      ...applyBranchScope(user, {}),
    };

    if (query.phone?.trim()) {
      const canonical = this.resolveCanonicalPhone(query.phone.trim());
      where.phone = { contains: canonical.slice(-Math.min(canonical.length, 10)) };
    }

    if (query.name?.trim()) {
      const term = query.name.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const candidates = await this.prisma.patient.findMany({
      where,
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        branchId: true,
        createdAt: true,
        abhaId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    await this.auditService.log({
      action: 'PATIENT_DUPLICATE_SEARCH',
      entity: 'Patient',
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        phoneQuery: query.phone?.trim() ?? null,
        nameQuery: query.name?.trim() ?? null,
        resultCount: candidates.length,
      },
    });

    return { data: candidates };
  }

  async findOne(user: AuthenticatedUser, patientId: string) {
    const patient = await this.findOwnedPatient(user, patientId);

    await this.auditService.log({
      action: 'PATIENT_READ',
      entity: 'Patient',
      entityId: patient.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
      metadata: { patientId: patient.id },
    });

    return patient;
  }

  async findAll(
    user: AuthenticatedUser,
    query: PatientQueryDto = {},
  ): Promise<PatientListResponse> {
    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where = applyBranchScope(
      user,
      this.buildSearchWhere(user.hospitalId, query),
    );

    const [total, data] = await this.prisma.$transaction([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        select: PATIENT_LIST_SELECT,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const response: PatientListResponse = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };

    await this.auditService.log({
      action: 'PATIENT_LIST_READ',
      entity: 'Patient',
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? query.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        page,
        limit,
        resultCount: data.length,
        total,
      },
    });

    return response;
  }

  async update(
    user: AuthenticatedUser,
    patientId: string,
    dto: UpdatePatientDto,
  ) {
    const patient = await this.findOwnedPatient(user, patientId);
    this.assertPatientIsActive(patient);

    const nextBranchId = this.resolveUpdateBranchId(
      user,
      dto.branchId,
      patient.branchId,
    );

    if (user.branchId == null && nextBranchId) {
      await this.validateBranch(user, nextBranchId);
    }

    let canonicalPhone: string | undefined;
    if (dto.phone !== undefined) {
      canonicalPhone = this.resolveCanonicalPhone(dto.phone);

      const existingPatient = await this.prisma.patient.findUnique({
        where: {
          hospitalId_phone: {
            hospitalId: user.hospitalId,
            phone: canonicalPhone,
          },
        },
      });

      if (existingPatient && existingPatient.id !== patientId) {
        throw new ConflictException(
          'Patient with this phone number already exists',
        );
      }
    }

    const beforeMedical = {
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      emergencyContacts: patient.emergencyContacts,
    };

    const updatedPatient = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.patient.update({
        where: {
          id: patientId,
        },
        data: {
          ...(canonicalPhone !== undefined && { phone: canonicalPhone }),
          ...(dto.firstName !== undefined && { firstName: dto.firstName }),
          ...(dto.lastName !== undefined && { lastName: dto.lastName }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.dateOfBirth !== undefined && {
            dateOfBirth: new Date(dto.dateOfBirth),
          }),
          ...(dto.gender !== undefined && { gender: dto.gender }),
          ...(dto.abhaId !== undefined && { abhaId: dto.abhaId }),
          ...(nextBranchId !== undefined && { branchId: nextBranchId }),
          ...(dto.allergies !== undefined && { allergies: dto.allergies }),
          ...(dto.chronicConditions !== undefined && {
            chronicConditions: dto.chronicConditions,
          }),
          ...(dto.emergencyContacts !== undefined && {
            emergencyContacts:
              dto.emergencyContacts as unknown as Prisma.InputJsonValue,
          }),
        },
      });

      await this.recordMedicalFieldChanges(tx, {
        hospitalId: user.hospitalId,
        patientId,
        changedByUserId: user.sub,
        before: beforeMedical,
        after: {
          allergies: updated.allergies,
          chronicConditions: updated.chronicConditions,
          emergencyContacts: updated.emergencyContacts,
        },
      });

      return updated;
    });

    await this.auditService.log({
      action: 'PATIENT_UPDATED',
      entity: 'Patient',
      entityId: updatedPatient.id,
      hospitalId: user.hospitalId,
      branchId: updatedPatient.branchId,
      userId: user.sub,
    });

    return updatedPatient;
  }

  async findFieldHistory(user: AuthenticatedUser, patientId: string) {
    const patient = await this.findOwnedPatient(user, patientId);

    await this.auditService.log({
      action: 'PATIENT_FIELD_HISTORY_READ',
      entity: 'Patient',
      entityId: patient.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
      metadata: { patientId: patient.id },
    });

    return this.prisma.patientFieldHistory.findMany({
      where: {
        hospitalId: user.hospitalId,
        patientId,
      },
      orderBy: {
        changedAt: 'desc',
      },
    });
  }

  async mergePatients(
    user: AuthenticatedUser,
    sourceId: string,
    targetId: string,
  ) {
    if (sourceId === targetId) {
      throw new BadRequestException('Source and target patients must differ');
    }

    const source = await this.findOwnedPatient(user, sourceId);
    const target = await this.findOwnedPatient(user, targetId);

    if (source.mergedIntoPatientId) {
      throw new ConflictException('Source patient has already been merged');
    }

    if (target.mergedIntoPatientId) {
      throw new BadRequestException(
        'Target patient has been merged and cannot receive merges',
      );
    }

    const mergedAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      await assertPatientMergePreconditions(
        tx,
        user.hospitalId,
        sourceId,
        targetId,
      );

      const reassign = await reassignPatientOwnedRecords(
        tx,
        user.hospitalId,
        sourceId,
        targetId,
      );

      const mergedSource = await tx.patient.update({
        where: {
          id: sourceId,
        },
        data: {
          mergedIntoPatientId: targetId,
          mergedAt,
          mergedByUserId: user.sub,
        },
      });

      return {
        source: mergedSource,
        target,
        reassign,
      };
    });

    await this.auditService.log({
      action: 'PATIENT_MERGED',
      entity: 'Patient',
      entityId: targetId,
      hospitalId: user.hospitalId,
      branchId: target.branchId,
      userId: user.sub,
      metadata: {
        sourcePatientId: sourceId,
        targetPatientId: targetId,
        appointmentsMoved: result.reassign.counts.appointment ?? 0,
        totalRecordsMoved: result.reassign.totalRecordsMoved,
        recordCounts: result.reassign.counts,
      },
    });

    return {
      sourcePatientId: sourceId,
      targetPatientId: targetId,
      appointmentsMoved: result.reassign.counts.appointment ?? 0,
      totalRecordsMoved: result.reassign.totalRecordsMoved,
      mergedAt: result.source.mergedAt,
    };
  }

  private async loadCompletedVisitStartAts(
    hospitalId: string,
    patientId: string,
  ): Promise<Date[]> {
    const completedAppointments = await this.prisma.appointment.findMany({
      where: {
        hospitalId,
        patientId,
        status: AppointmentStatus.COMPLETED,
      },
      select: {
        startAt: true,
      },
      orderBy: {
        startAt: 'asc',
      },
    });

    return completedAppointments.map((appointment) => appointment.startAt);
  }

  private async persistAtRiskEvaluation(input: {
    patientId: string;
    hospitalId: string;
    branchId: string | null;
    evaluatedAt: Date;
    evaluation: ReturnType<typeof computePatientAtRiskEvaluation>;
  }) {
    const updated = await this.prisma.patient.update({
      where: { id: input.patientId },
      data: {
        isAtRisk: input.evaluation.isAtRisk,
        atRiskStatus: input.evaluation.atRiskStatus,
        suggestedAction: input.evaluation.suggestedAction,
        atRiskEvaluatedAt: input.evaluatedAt,
        daysSinceLastVisit: input.evaluation.daysSinceLastVisit,
        averageVisitCadenceDays: input.evaluation.averageVisitCadenceDays,
      },
    });

    await this.patientEngagementActionService.syncFromAtRiskEvaluation({
      patient: updated,
      atRiskStatus: input.evaluation.atRiskStatus,
      suggestedAction: input.evaluation.suggestedAction,
      evaluatedAt: input.evaluatedAt,
    });

    return updated;
  }

  async evaluateAtRisk(
    user: AuthenticatedUser,
    patientId: string,
    dto: EvaluateAtRiskDto = {},
  ) {
    await this.findOwnedPatient(user, patientId);
    const cadenceMultiplier =
      dto.cadenceMultiplier ?? DEFAULT_AT_RISK_CADENCE_MULTIPLIER;

    const visitStartAts = await this.loadCompletedVisitStartAts(
      user.hospitalId,
      patientId,
    );
    const evaluatedAt = new Date();
    const evaluation = computePatientAtRiskEvaluation({
      completedVisitStartAts: visitStartAts,
      evaluatedAt,
      cadenceMultiplier,
    });

    const updated = await this.persistAtRiskEvaluation({
      patientId,
      hospitalId: user.hospitalId,
      branchId: null,
      evaluatedAt,
      evaluation,
    });

    if (evaluation.atRiskStatus !== PatientAtRiskStatus.INSUFFICIENT_HISTORY) {
      await this.auditService.log({
        action: 'PATIENT_AT_RISK_EVALUATED',
        entity: 'Patient',
        entityId: patientId,
        hospitalId: user.hospitalId,
        branchId: updated.branchId,
        userId: user.sub,
        metadata: {
          isAtRisk: evaluation.isAtRisk,
          atRiskStatus: evaluation.atRiskStatus,
          daysSinceLastVisit: evaluation.daysSinceLastVisit,
          averageVisitCadenceDays: evaluation.averageVisitCadenceDays,
          cadenceMultiplier,
        },
      });
    }

    return updated;
  }

  async evaluateAtRiskForSystemJob(
    context: SystemJobExecutionContext,
    patientId: string,
  ): Promise<Patient> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || patient.hospitalId !== context.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    if (patient.mergedIntoPatientId) {
      throw new BadRequestException(
        'Patient has been merged and cannot be evaluated',
      );
    }

    const visitStartAts = await this.loadCompletedVisitStartAts(
      context.hospitalId,
      patientId,
    );
    const evaluatedAt = new Date();
    const evaluation = computePatientAtRiskEvaluation({
      completedVisitStartAts: visitStartAts,
      evaluatedAt,
      cadenceMultiplier: DEFAULT_AT_RISK_CADENCE_MULTIPLIER,
    });

    const updated = await this.persistAtRiskEvaluation({
      patientId,
      hospitalId: context.hospitalId,
      branchId: patient.branchId,
      evaluatedAt,
      evaluation,
    });

    await this.auditService.log({
      action: 'PATIENT_AT_RISK_EVALUATED',
      entity: 'Patient',
      entityId: patientId,
      hospitalId: context.hospitalId,
      branchId: updated.branchId,
      userId: null,
      metadata: {
        isAtRisk: evaluation.isAtRisk,
        atRiskStatus: evaluation.atRiskStatus,
        jobId: context.jobId,
        workerId: context.workerId,
        source: 'background_job',
      },
    });

    return updated;
  }

  async evaluateHospitalPatientsAtRiskForSystemJob(
    context: SystemJobExecutionContext,
  ): Promise<{ evaluatedCount: number; atRiskCount: number }> {
    let evaluatedCount = 0;
    let atRiskCount = 0;
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.patient.findMany({
        where: {
          hospitalId: context.hospitalId,
          mergedIntoPatientId: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PATIENT_AT_RISK_EVALUATE_BATCH_SIZE,
      });

      if (batch.length === 0) {
        break;
      }

      for (const row of batch) {
        const updated = await this.evaluateAtRiskForSystemJob(
          context,
          row.id,
        );
        evaluatedCount += 1;
        if (updated.isAtRisk) {
          atRiskCount += 1;
        }
      }

      cursor = batch[batch.length - 1].id;

      if (batch.length < PATIENT_AT_RISK_EVALUATE_BATCH_SIZE) {
        break;
      }
    }

    return { evaluatedCount, atRiskCount };
  }

  async getNotificationPreferences(user: AuthenticatedUser, patientId: string) {
    const patient = await this.findOwnedPatient(user, patientId);
    const whatsappTransactionalEnabled =
      await this.patientNotificationPreferenceService.isWhatsAppTransactionalEnabled(
        user.hospitalId,
        patient.id,
      );

    return { whatsappTransactionalEnabled };
  }

  async updateNotificationPreferences(
    user: AuthenticatedUser,
    patientId: string,
    dto: UpdatePatientNotificationPreferenceDto,
  ) {
    const patient = await this.findOwnedPatient(user, patientId);
    this.assertPatientIsActive(patient);

    const previousEnabled =
      await this.patientNotificationPreferenceService.isWhatsAppTransactionalEnabled(
        user.hospitalId,
        patient.id,
      );

    if (previousEnabled === dto.whatsappTransactionalEnabled) {
      return { whatsappTransactionalEnabled: previousEnabled };
    }

    await this.patientNotificationPreferenceService.upsertWhatsAppTransactionalEnabled(
      user.hospitalId,
      patient.id,
      dto.whatsappTransactionalEnabled,
    );

    await this.auditService.log({
      action: 'PATIENT_NOTIFICATION_PREFERENCE_UPDATED',
      entity: 'PatientNotificationPreference',
      entityId: patient.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
      metadata: {
        patientId: patient.id,
        field: 'whatsappTransactionalEnabled',
        previousEnabled,
        enabled: dto.whatsappTransactionalEnabled,
      },
    });

    return { whatsappTransactionalEnabled: dto.whatsappTransactionalEnabled };
  }
}
