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
import { PrismaService } from '../common/prisma/prisma.service';
import {
  canonicalizePatientPhone,
  tryCanonicalizePatientPhone,
} from '../common/utils/phone.util';
import { CreatePatientDto } from './dto/create-patient.dto';
import { EvaluateAtRiskDto } from './dto/evaluate-at-risk.dto';
import { PatientQueryDto } from './dto/patient-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

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

const DEFAULT_AT_RISK_CADENCE_MULTIPLIER = 1.5;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

    return patient;
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
    };
  }

  private calculateDaysBetween(start: Date, end: Date): number {
    const startUtc = Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate(),
    );
    const endUtc = Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate(),
    );

    return Math.round((endUtc - startUtc) / 86400000);
  }

  private resolveCanonicalPhone(phone: string): string {
    return canonicalizePatientPhone(phone);
  }

  async create(user: AuthenticatedUser, dto: CreatePatientDto) {
    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
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
          branchId: dto.branchId,
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

  async findOne(user: AuthenticatedUser, patientId: string) {
    return this.findOwnedPatient(user, patientId);
  }

  async findAll(user: AuthenticatedUser, query: PatientQueryDto = {}) {
    if (query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where = this.buildSearchWhere(user.hospitalId, query);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async update(
    user: AuthenticatedUser,
    patientId: string,
    dto: UpdatePatientDto,
  ) {
    const patient = await this.findOwnedPatient(user, patientId);
    this.assertPatientIsActive(patient);

    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
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
          ...(dto.branchId !== undefined && { branchId: dto.branchId }),
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
    await this.findOwnedPatient(user, patientId);

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
      const appointmentsMoved = await tx.appointment.updateMany({
        where: {
          hospitalId: user.hospitalId,
          patientId: sourceId,
        },
        data: {
          patientId: targetId,
        },
      });

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
        appointmentsMoved: appointmentsMoved.count,
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
        appointmentsMoved: result.appointmentsMoved,
      },
    });

    return {
      sourcePatientId: sourceId,
      targetPatientId: targetId,
      appointmentsMoved: result.appointmentsMoved,
      mergedAt: result.source.mergedAt,
    };
  }

  async evaluateAtRisk(
    user: AuthenticatedUser,
    patientId: string,
    dto: EvaluateAtRiskDto = {},
  ) {
    const patient = await this.findOwnedPatient(user, patientId);
    const cadenceMultiplier =
      dto.cadenceMultiplier ?? DEFAULT_AT_RISK_CADENCE_MULTIPLIER;

    const completedAppointments = await this.prisma.appointment.findMany({
      where: {
        hospitalId: user.hospitalId,
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

    const evaluatedAt = new Date();

    if (completedAppointments.length < 2) {
      const updated = await this.prisma.patient.update({
        where: {
          id: patientId,
        },
        data: {
          isAtRisk: false,
          atRiskStatus: PatientAtRiskStatus.INSUFFICIENT_HISTORY,
          suggestedAction:
            'Insufficient completed visit history for at-risk assessment',
          atRiskEvaluatedAt: evaluatedAt,
          daysSinceLastVisit: null,
          averageVisitCadenceDays: null,
        },
      });

      return updated;
    }

    const visitDates = completedAppointments.map(
      (appointment) => appointment.startAt,
    );
    const gaps: number[] = [];

    for (let index = 1; index < visitDates.length; index += 1) {
      gaps.push(
        this.calculateDaysBetween(visitDates[index - 1], visitDates[index]),
      );
    }

    const averageVisitCadenceDays =
      gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const lastVisitDate = visitDates[visitDates.length - 1];
    const daysSinceLastVisit = this.calculateDaysBetween(
      lastVisitDate,
      evaluatedAt,
    );
    const thresholdDays = averageVisitCadenceDays * cadenceMultiplier;
    const isAtRisk = daysSinceLastVisit > thresholdDays;

    const suggestedAction = isAtRisk
      ? `Schedule follow-up; ${daysSinceLastVisit} days since last completed visit (typical cadence: ${Math.round(averageVisitCadenceDays)} days)`
      : 'Continue routine follow-up based on historical visit cadence';

    const updated = await this.prisma.patient.update({
      where: {
        id: patientId,
      },
      data: {
        isAtRisk,
        atRiskStatus: isAtRisk
          ? PatientAtRiskStatus.AT_RISK
          : PatientAtRiskStatus.NOT_AT_RISK,
        suggestedAction,
        atRiskEvaluatedAt: evaluatedAt,
        daysSinceLastVisit,
        averageVisitCadenceDays,
      },
    });

    await this.auditService.log({
      action: 'PATIENT_AT_RISK_EVALUATED',
      entity: 'Patient',
      entityId: patientId,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        isAtRisk,
        atRiskStatus: updated.atRiskStatus,
        daysSinceLastVisit,
        averageVisitCadenceDays,
        cadenceMultiplier,
      },
    });

    return updated;
  }
}
