import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  IpdAdmissionStatus,
  PrescriptionStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdateDiagnosisDto } from './dto/update-diagnosis.dto';
import { UpdatePrescriptionStatusDto } from './dto/update-prescription-status.dto';
import { UpsertSoapDto } from './dto/upsert-soap.dto';
import { SoapVersionQueryDto } from './dto/soap-version-query.dto';
import { SoapVersionListResponseDto } from './dto/soap-version-response.dto';
import {
  areSoapContentsEqual,
  mergeSoapContent,
  soapContentFromDto,
  soapContentFromNote,
  soapContentToWriteData,
} from './utils/soap-content.util';
import { isAllowedEncounterTransition } from './utils/encounter-transitions.util';
import { Icd10Service } from './icd10/icd10.service';
import { ClinicalPrescriptionOutboxService } from './events/clinical-prescription-outbox.service';
import { PrescriptionSafetyService } from './safety/prescription-safety.service';
import { SafetyOverrideInput } from './safety/safety.types';
import { mapAllergyWarningsFromFindings } from './utils/prescription-response.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
  roleId?: string;
};

const encounterInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      allergies: true,
    },
  },
  provider: {
    select: { id: true, name: true, email: true },
  },
  appointment: {
    select: { id: true, startAt: true, endAt: true, status: true },
  },
  ipdAdmission: {
    select: { id: true, admissionNumber: true, status: true },
  },
  soapNote: true,
  diagnoses: { orderBy: { createdAt: 'asc' as const } },
  prescriptions: {
    include: { items: true },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ClinicalEncounterInclude;

const SOAP_VERSION_DEFAULT_PAGE = 1;
const SOAP_VERSION_DEFAULT_LIMIT = 20;

@Injectable()
export class ClinicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly prescriptionSafetyService: PrescriptionSafetyService,
    private readonly clinicalPrescriptionOutboxService: ClinicalPrescriptionOutboxService,
    private readonly icd10Service: Icd10Service,
  ) {}

  private async validatePatient(user: AuthenticatedUser, patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    if (patient.mergedIntoPatientId) {
      throw new BadRequestException('Patient record is not active');
    }

    if (patient.branchId != null) {
      assertBranchAccess(user, patient.branchId);
    }

    return patient;
  }

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

    return branch;
  }

  private async validateProvider(user: AuthenticatedUser, providerUserId: string) {
    const provider = await this.prisma.user.findUnique({
      where: { id: providerUserId },
    });

    if (!provider || provider.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Provider not found');
    }

    return provider;
  }

  private async findOwnedEncounter(user: AuthenticatedUser, encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      include: encounterInclude,
    });

    if (!encounter || encounter.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Clinical encounter not found');
    }

    assertBranchAccess(user, encounter.branchId);

    return encounter;
  }

  private assertEncounterModifiable(status: ClinicalEncounterStatus): void {
    if (status === ClinicalEncounterStatus.CANCELLED) {
      throw new BadRequestException('Cancelled encounters cannot be modified');
    }
  }

  private async assertNoOpenEncounterForContext(input: {
    hospitalId: string;
    appointmentId?: string;
    ipdAdmissionId?: string;
  }): Promise<void> {
    if (input.appointmentId) {
      const existing = await this.prisma.clinicalEncounter.findFirst({
        where: {
          hospitalId: input.hospitalId,
          appointmentId: input.appointmentId,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      if (existing) {
        throw new ConflictException(
          'An open clinical encounter already exists for this appointment',
        );
      }
    }

    if (input.ipdAdmissionId) {
      const existing = await this.prisma.clinicalEncounter.findFirst({
        where: {
          hospitalId: input.hospitalId,
          ipdAdmissionId: input.ipdAdmissionId,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      if (existing) {
        throw new ConflictException(
          'An open clinical encounter already exists for this admission',
        );
      }
    }
  }

  async createEncounter(user: AuthenticatedUser, dto: CreateEncounterDto) {
    await this.validatePatient(user, dto.patientId);
    await this.validateProvider(user, user.sub);

    if (dto.appointmentId && dto.ipdAdmissionId) {
      throw new BadRequestException(
        'An encounter cannot reference both an appointment and an IPD admission',
      );
    }

    if (dto.encounterType === ClinicalEncounterType.OPD && !dto.appointmentId) {
      throw new BadRequestException('OPD encounters require an appointmentId');
    }

    if (dto.encounterType === ClinicalEncounterType.IPD && !dto.ipdAdmissionId) {
      throw new BadRequestException('IPD encounters require an ipdAdmissionId');
    }

    let branchId: string | null = null;

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
      });

      if (!appointment || appointment.hospitalId !== user.hospitalId) {
        throw new NotFoundException('Appointment not found');
      }

      if (appointment.patientId !== dto.patientId) {
        throw new BadRequestException(
          'Appointment does not belong to the specified patient',
        );
      }

      assertBranchAccess(user, appointment.branchId);
      branchId = appointment.branchId;
    }

    if (dto.ipdAdmissionId) {
      const admission = await this.prisma.ipdAdmission.findUnique({
        where: { id: dto.ipdAdmissionId },
      });

      if (!admission || admission.hospitalId !== user.hospitalId) {
        throw new NotFoundException('IPD admission not found');
      }

      if (admission.patientId !== dto.patientId) {
        throw new BadRequestException(
          'IPD admission does not belong to the specified patient',
        );
      }

      if (admission.status !== IpdAdmissionStatus.ADMITTED) {
        throw new BadRequestException(
          'Clinical IPD encounters require an active admission',
        );
      }

      assertBranchAccess(user, admission.branchId);
      branchId = admission.branchId;
    }

    await this.assertNoOpenEncounterForContext({
      hospitalId: user.hospitalId,
      appointmentId: dto.appointmentId,
      ipdAdmissionId: dto.ipdAdmissionId,
    });

    const encounter = await this.prisma.clinicalEncounter.create({
      data: {
        hospitalId: user.hospitalId,
        branchId,
        patientId: dto.patientId,
        appointmentId: dto.appointmentId,
        ipdAdmissionId: dto.ipdAdmissionId,
        providerUserId: user.sub,
        encounterType: dto.encounterType,
        status: ClinicalEncounterStatus.OPEN,
      },
      include: encounterInclude,
    });

    await this.auditService.log({
      action: 'CLINICAL_ENCOUNTER_CREATED',
      entity: 'ClinicalEncounter',
      entityId: encounter.id,
      hospitalId: user.hospitalId,
      branchId: encounter.branchId,
      userId: user.sub,
      metadata: {
        patientId: encounter.patientId,
        encounterType: encounter.encounterType,
        appointmentId: encounter.appointmentId,
        ipdAdmissionId: encounter.ipdAdmissionId,
      },
    });

    return encounter;
  }

  async getEncounter(user: AuthenticatedUser, encounterId: string) {
    const encounter = await this.findOwnedEncounter(user, encounterId);
    await this.auditService.log({
      action: 'CLINICAL_ENCOUNTER_READ',
      entity: 'ClinicalEncounter',
      entityId: encounter.id,
      hospitalId: user.hospitalId,
      branchId: encounter.branchId,
      userId: user.sub,
      metadata: { patientId: encounter.patientId },
    });
    return encounter;
  }

  async listEncounters(
    user: AuthenticatedUser,
    patientId?: string,
    branchId?: string,
  ) {
    if (patientId) {
      await this.validatePatient(user, patientId);
    }

    if (user.branchId == null && branchId) {
      await this.validateBranch(user, branchId);
    }

    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      ...(patientId !== undefined && { patientId }),
      ...(branchId !== undefined && { branchId }),
    });

    const encounters = await this.prisma.clinicalEncounter.findMany({
      where,
      include: encounterInclude,
      orderBy: { startedAt: 'desc' },
    });

    await this.auditService.log({
      action: 'CLINICAL_ENCOUNTER_LIST_READ',
      entity: patientId ? 'Patient' : 'ClinicalEncounter',
      entityId: patientId ?? null,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? branchId ?? null,
      userId: user.sub,
      metadata: {
        scope: patientId ? 'patient' : 'hospital',
        resultCount: encounters.length,
      },
    });

    return encounters;
  }

  async completeEncounter(user: AuthenticatedUser, encounterId: string) {
    const encounter = await this.findOwnedEncounter(user, encounterId);

    if (!isAllowedEncounterTransition(encounter.status, ClinicalEncounterStatus.COMPLETED)) {
      throw new BadRequestException(
        `Cannot complete encounter from status ${encounter.status}`,
      );
    }

    const updated = await this.prisma.clinicalEncounter.update({
      where: { id: encounterId },
      data: {
        status: ClinicalEncounterStatus.COMPLETED,
        endedAt: new Date(),
      },
      include: encounterInclude,
    });

    await this.auditService.log({
      action: 'CLINICAL_ENCOUNTER_COMPLETED',
      entity: 'ClinicalEncounter',
      entityId: encounterId,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { previousStatus: encounter.status, newStatus: updated.status },
    });

    return updated;
  }

  async cancelEncounter(user: AuthenticatedUser, encounterId: string) {
    const encounter = await this.findOwnedEncounter(user, encounterId);

    if (!isAllowedEncounterTransition(encounter.status, ClinicalEncounterStatus.CANCELLED)) {
      throw new BadRequestException(
        `Cannot cancel encounter from status ${encounter.status}`,
      );
    }

    const updated = await this.prisma.clinicalEncounter.update({
      where: { id: encounterId },
      data: { status: ClinicalEncounterStatus.CANCELLED },
      include: encounterInclude,
    });

    await this.auditService.log({
      action: 'CLINICAL_ENCOUNTER_CANCELLED',
      entity: 'ClinicalEncounter',
      entityId: encounterId,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { previousStatus: encounter.status, newStatus: updated.status },
    });

    return updated;
  }

  async createOrUpdateSoap(
    user: AuthenticatedUser,
    encounterId: string,
    dto: UpsertSoapDto,
  ) {
    const encounter = await this.findOwnedEncounter(user, encounterId);
    this.assertEncounterModifiable(encounter.status);

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "ClinicalEncounter" WHERE id = ${encounterId} FOR UPDATE`;

      const existing = await tx.clinicalSoapNote.findUnique({
        where: { encounterId },
      });

      if (!existing) {
        const content = soapContentFromDto(dto);
        const created = await tx.clinicalSoapNote.create({
          data: {
            hospitalId: user.hospitalId,
            encounterId,
            ...soapContentToWriteData(content),
            createdByUserId: user.sub,
          },
        });

        await tx.clinicalSoapNoteVersion.create({
          data: {
            hospitalId: user.hospitalId,
            encounterId,
            version: 1,
            ...soapContentToWriteData(content),
            createdByUserId: user.sub,
          },
        });

        return { note: created, created: true, updated: false };
      }

      await tx.$executeRaw`SELECT id FROM "ClinicalSoapNote" WHERE "encounterId" = ${encounterId} FOR UPDATE`;

      const current = await tx.clinicalSoapNote.findUniqueOrThrow({
        where: { encounterId },
      });

      const merged = mergeSoapContent(soapContentFromNote(current), dto);
      const previous = soapContentFromNote(current);

      if (areSoapContentsEqual(merged, previous)) {
        return { note: current, created: false, updated: false };
      }

      const versionAgg = await tx.clinicalSoapNoteVersion.aggregate({
        where: { encounterId },
        _max: { version: true },
      });
      const nextVersion = (versionAgg._max.version ?? 0) + 1;

      await tx.clinicalSoapNoteVersion.create({
        data: {
          hospitalId: user.hospitalId,
          encounterId,
          version: nextVersion,
          ...soapContentToWriteData(merged),
          createdByUserId: user.sub,
        },
      });

      const updated = await tx.clinicalSoapNote.update({
        where: { encounterId },
        data: soapContentToWriteData(merged),
      });

      return { note: updated, created: false, updated: true };
    });

    if (outcome.created) {
      await this.auditService.log({
        action: 'CLINICAL_SOAP_CREATED',
        entity: 'ClinicalSoapNote',
        entityId: outcome.note.id,
        hospitalId: user.hospitalId,
        branchId: encounter.branchId,
        userId: user.sub,
        metadata: { encounterId },
      });
    } else if (outcome.updated) {
      await this.auditService.log({
        action: 'CLINICAL_SOAP_UPDATED',
        entity: 'ClinicalSoapNote',
        entityId: outcome.note.id,
        hospitalId: user.hospitalId,
        branchId: encounter.branchId,
        userId: user.sub,
        metadata: {
          encounterId,
          encounterStatus: encounter.status,
        },
      });
    }

    return outcome.note;
  }

  async listSoapVersions(
    user: AuthenticatedUser,
    encounterId: string,
    query: SoapVersionQueryDto = {},
  ): Promise<SoapVersionListResponseDto> {
    await this.findOwnedEncounter(user, encounterId);

    const page = query.page ?? SOAP_VERSION_DEFAULT_PAGE;
    const limit = query.limit ?? SOAP_VERSION_DEFAULT_LIMIT;

    const where = {
      hospitalId: user.hospitalId,
      encounterId,
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.clinicalSoapNoteVersion.count({ where }),
      this.prisma.clinicalSoapNoteVersion.findMany({
        where,
        orderBy: { version: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          version: true,
          subjective: true,
          objective: true,
          assessment: true,
          plan: true,
          createdByUserId: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getSoap(user: AuthenticatedUser, encounterId: string) {
    const encounter = await this.findOwnedEncounter(user, encounterId);

    const soap = await this.prisma.clinicalSoapNote.findUnique({
      where: { encounterId },
    });

    if (!soap || soap.hospitalId !== user.hospitalId) {
      throw new NotFoundException('SOAP note not found');
    }

    await this.auditService.log({
      action: 'CLINICAL_SOAP_READ',
      entity: 'ClinicalEncounter',
      entityId: encounterId,
      hospitalId: user.hospitalId,
      branchId: encounter.branchId,
      userId: user.sub,
      metadata: { patientId: encounter.patientId },
    });

    return soap;
  }

  async createDiagnosis(
    user: AuthenticatedUser,
    encounterId: string,
    dto: CreateDiagnosisDto,
  ) {
    const encounter = await this.findOwnedEncounter(user, encounterId);
    this.assertEncounterModifiable(encounter.status);

    const catalogue = await this.icd10Service.validateActiveCode(dto.code);

    const diagnosis = await this.prisma.clinicalDiagnosis.create({
      data: {
        hospitalId: user.hospitalId,
        encounterId,
        code: catalogue.code,
        description: catalogue.description,
        diagnosisType: dto.diagnosisType,
        createdByUserId: user.sub,
      },
    });

    await this.auditService.log({
      action: 'CLINICAL_DIAGNOSIS_CREATED',
      entity: 'ClinicalDiagnosis',
      entityId: diagnosis.id,
      hospitalId: user.hospitalId,
      branchId: encounter.branchId,
      userId: user.sub,
      metadata: {
        encounterId,
        code: diagnosis.code,
        diagnosisType: diagnosis.diagnosisType,
      },
    });

    return diagnosis;
  }

  async listDiagnoses(user: AuthenticatedUser, encounterId: string) {
    const encounter = await this.findOwnedEncounter(user, encounterId);

    await this.auditService.log({
      action: 'CLINICAL_DIAGNOSIS_LIST_READ',
      entity: 'ClinicalEncounter',
      entityId: encounterId,
      hospitalId: user.hospitalId,
      branchId: encounter.branchId,
      userId: user.sub,
      metadata: { patientId: encounter.patientId },
    });

    return this.prisma.clinicalDiagnosis.findMany({
      where: {
        hospitalId: user.hospitalId,
        encounterId,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateDiagnosis(
    user: AuthenticatedUser,
    diagnosisId: string,
    dto: UpdateDiagnosisDto,
  ) {
    const existing = await this.prisma.clinicalDiagnosis.findUnique({
      where: { id: diagnosisId },
      include: { encounter: true },
    });

    if (!existing || existing.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Diagnosis not found');
    }

    assertBranchAccess(user, existing.encounter.branchId);
    this.assertEncounterModifiable(existing.encounter.status);

    let code = existing.code;
    let description = existing.description;

    if (dto.code !== undefined) {
      const catalogue = await this.icd10Service.validateActiveCode(dto.code);
      code = catalogue.code;
      description = catalogue.description;
    }

    const updated = await this.prisma.clinicalDiagnosis.update({
      where: { id: diagnosisId },
      data: {
        ...(dto.code !== undefined && { code, description }),
        ...(dto.diagnosisType !== undefined && {
          diagnosisType: dto.diagnosisType,
        }),
      },
    });

    await this.auditService.log({
      action: 'CLINICAL_DIAGNOSIS_UPDATED',
      entity: 'ClinicalDiagnosis',
      entityId: diagnosisId,
      hospitalId: user.hospitalId,
      branchId: existing.encounter.branchId,
      userId: user.sub,
      metadata: { encounterId: existing.encounterId, code: updated.code },
    });

    return updated;
  }

  async deleteDiagnosis(user: AuthenticatedUser, diagnosisId: string) {
    const existing = await this.prisma.clinicalDiagnosis.findUnique({
      where: { id: diagnosisId },
      include: { encounter: true },
    });

    if (!existing || existing.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Diagnosis not found');
    }

    assertBranchAccess(user, existing.encounter.branchId);
    this.assertEncounterModifiable(existing.encounter.status);

    await this.prisma.clinicalDiagnosis.delete({
      where: { id: diagnosisId },
    });

    await this.auditService.log({
      action: 'CLINICAL_DIAGNOSIS_DELETED',
      entity: 'ClinicalDiagnosis',
      entityId: diagnosisId,
      hospitalId: user.hospitalId,
      branchId: existing.encounter.branchId,
      userId: user.sub,
      metadata: { encounterId: existing.encounterId, code: existing.code },
    });

    return { deleted: true };
  }

  async createPrescription(
    user: AuthenticatedUser,
    encounterId: string,
    dto: CreatePrescriptionDto,
  ) {
    const encounter = await this.findOwnedEncounter(user, encounterId);
    this.assertEncounterModifiable(encounter.status);

    if (!dto.items?.length) {
      throw new BadRequestException('Prescription must include at least one item');
    }

    const patient = await this.validatePatient(user, encounter.patientId);

    const evaluation = await this.prescriptionSafetyService.evaluateForPrescription(
      {
        hospitalId: user.hospitalId,
        patientId: encounter.patientId,
        patientAllergies: patient.allergies,
        patientUpdatedAt: patient.updatedAt,
        dto,
      },
    );

    const hasOverridePermission = user.roleId
      ? await this.prescriptionSafetyService.userHasSafetyOverridePermission(
          user.roleId,
        )
      : false;

    const safetyOverride: SafetyOverrideInput | undefined = dto.safetyOverrides
      ? {
          findingKeys: dto.safetyOverrides.findingKeys,
          reason: dto.safetyOverrides.reason,
        }
      : undefined;

    const findingsToPersist = this.prescriptionSafetyService.assertCanPersist(
      evaluation,
      safetyOverride,
      hasOverridePermission,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.create({
        data: {
          hospitalId: user.hospitalId,
          encounterId,
          patientId: encounter.patientId,
          prescribedByUserId: user.sub,
          notes: dto.notes,
          items: {
            create: evaluation.resolvedLines.map((line, index) => {
              const item = dto.items[index]!;
              return {
                medicationName: line.medicationName.trim(),
                clinicalDrugId: line.clinicalDrugId,
                drugResolutionStatus: line.drugResolutionStatus,
                dosage: item.dosage,
                route: item.route,
                frequency: item.frequency,
                duration: item.duration,
                instructions: item.instructions,
                quantity: item.quantity,
              };
            }),
          },
        },
        include: { items: true },
      });

      const safetyEvaluation = await tx.prescriptionSafetyEvaluation.create({
        data: {
          prescriptionId: prescription.id,
          hospitalId: user.hospitalId,
          evaluatorVersion:
            this.prescriptionSafetyService.getEvaluatorVersion(),
          interactionAdapterStatus: evaluation.interactionAdapterStatus,
          patientUpdatedAt: evaluation.patientUpdatedAt,
        },
      });

      if (findingsToPersist.length > 0) {
        await tx.prescriptionSafetyFinding.createMany({
          data: findingsToPersist.map((finding) => ({
            hospitalId: user.hospitalId,
            evaluationId: safetyEvaluation.id,
            findingKey: finding.findingKey,
            findingType: finding.findingType,
            severity: finding.severity,
            summary: finding.summary,
            detailJson:
              finding.detailJson === undefined
                ? Prisma.JsonNull
                : (finding.detailJson as Prisma.InputJsonValue),
            source: finding.source,
            overridden: finding.overridden ?? false,
            overrideReason: finding.overrideReason ?? null,
            overrideByUserId: finding.overridden ? user.sub : null,
            overrideAt: finding.overrideAt ?? null,
          })),
        });
      }

      const safetyEvaluationWithFindings =
        await tx.prescriptionSafetyEvaluation.findUniqueOrThrow({
          where: { id: safetyEvaluation.id },
          include: { findings: true },
        });

      await this.auditService.logInTransaction(tx, {
        action: 'CLINICAL_PRESCRIPTION_CREATED',
        entity: 'Prescription',
        entityId: prescription.id,
        hospitalId: user.hospitalId,
        branchId: encounter.branchId,
        userId: user.sub,
        metadata: {
          encounterId,
          patientId: encounter.patientId,
          itemCount: prescription.items.length,
        },
      });

      await this.auditService.logInTransaction(tx, {
        action: 'CLINICAL_PRESCRIPTION_SAFETY_EVALUATED',
        entity: 'PrescriptionSafetyEvaluation',
        entityId: safetyEvaluation.id,
        hospitalId: user.hospitalId,
        branchId: encounter.branchId,
        userId: user.sub,
        metadata: {
          prescriptionId: prescription.id,
          findingCount: safetyEvaluationWithFindings.findings.length,
        },
      });

      if (findingsToPersist.some((finding) => finding.overridden)) {
        await this.auditService.logInTransaction(tx, {
          action: 'CLINICAL_PRESCRIPTION_SAFETY_OVERRIDE',
          entity: 'Prescription',
          entityId: prescription.id,
          hospitalId: user.hospitalId,
          branchId: encounter.branchId,
          userId: user.sub,
          metadata: {
            findingKeys: findingsToPersist
              .filter((finding) => finding.overridden)
              .map((finding) => finding.findingKey),
          },
        });
      }

      await this.clinicalPrescriptionOutboxService.emitPrescriptionCreatedInTransaction(
        tx,
        {
          prescription: {
            id: prescription.id,
            hospitalId: prescription.hospitalId,
            branchId: encounter.branchId,
            patientId: prescription.patientId,
            encounterId: prescription.encounterId,
            status: prescription.status,
          },
          actorUserId: user.sub,
        },
      );

      return { prescription, safetyEvaluation: safetyEvaluationWithFindings };
    });

    const allergyWarnings = mapAllergyWarningsFromFindings(findingsToPersist);

    return {
      ...result.prescription,
      allergyWarnings,
      interactionCheckAvailable: evaluation.interactionCheckAvailable,
      safetyFindings: result.safetyEvaluation.findings,
    };
  }

  async listPrescriptions(user: AuthenticatedUser, encounterId: string) {
    const encounter = await this.findOwnedEncounter(user, encounterId);

    await this.auditService.log({
      action: 'CLINICAL_PRESCRIPTION_LIST_READ',
      entity: 'ClinicalEncounter',
      entityId: encounterId,
      hospitalId: user.hospitalId,
      branchId: encounter.branchId,
      userId: user.sub,
      metadata: { patientId: encounter.patientId },
    });

    return this.prisma.prescription.findMany({
      where: {
        hospitalId: user.hospitalId,
        encounterId,
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPrescription(user: AuthenticatedUser, prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { items: true, encounter: true },
    });

    if (!prescription || prescription.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Prescription not found');
    }

    assertBranchAccess(user, prescription.encounter.branchId);

    await this.auditService.log({
      action: 'CLINICAL_PRESCRIPTION_READ',
      entity: 'Prescription',
      entityId: prescriptionId,
      hospitalId: user.hospitalId,
      branchId: prescription.encounter.branchId,
      userId: user.sub,
      metadata: {
        patientId: prescription.patientId,
        encounterId: prescription.encounterId,
      },
    });

    return prescription;
  }

  async updatePrescriptionStatus(
    user: AuthenticatedUser,
    prescriptionId: string,
    dto: UpdatePrescriptionStatusDto,
  ) {
    const existing = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { encounter: true },
    });

    if (!existing || existing.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Prescription not found');
    }

    assertBranchAccess(user, existing.encounter.branchId);

    if (existing.status === dto.status) {
      return this.getPrescription(user, prescriptionId);
    }

    if (
      existing.status === PrescriptionStatus.CANCELLED ||
      existing.status === PrescriptionStatus.COMPLETED
    ) {
      throw new BadRequestException('Terminal prescriptions cannot change status');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.update({
        where: { id: prescriptionId },
        data: { status: dto.status },
        include: { items: true, encounter: true },
      });

      await this.auditService.logInTransaction(tx, {
        action: 'CLINICAL_PRESCRIPTION_STATUS_CHANGED',
        entity: 'Prescription',
        entityId: prescriptionId,
        hospitalId: user.hospitalId,
        branchId: existing.encounter.branchId,
        userId: user.sub,
        metadata: {
          previousStatus: existing.status,
          newStatus: dto.status,
          encounterId: existing.encounterId,
        },
      });

      await this.clinicalPrescriptionOutboxService.emitPrescriptionStatusChangedInTransaction(
        tx,
        {
          prescription: {
            id: prescription.id,
            hospitalId: prescription.hospitalId,
            branchId: prescription.encounter.branchId,
            patientId: prescription.patientId,
            encounterId: prescription.encounterId,
            status: prescription.status,
          },
          actorUserId: user.sub,
          previousStatus: existing.status,
          newStatus: dto.status,
        },
      );

      return prescription;
    });

    return updated;
  }

  async getPatientClinicalRecords(user: AuthenticatedUser, patientId: string) {
    await this.validatePatient(user, patientId);

    const encounters = await this.queryPatientClinicalEncounters(
      user,
      patientId,
    );

    return {
      patientId,
      encounters,
    };
  }

  private async queryPatientClinicalEncounters(
    user: AuthenticatedUser,
    patientId: string,
  ) {
    const where = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      patientId,
    });

    return this.prisma.clinicalEncounter.findMany({
      where,
      include: encounterInclude,
      orderBy: { startedAt: 'desc' },
    });
  }

  async getPatientClinicalRecordsForPortal(
    scope: { hospitalId: string; branchId: string | null },
    patientId: string,
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.hospitalId !== scope.hospitalId) {
      throw new NotFoundException('Patient not found');
    }
    if (scope.branchId != null && patient.branchId !== scope.branchId) {
      throw new ForbiddenException('Access to this branch is not permitted');
    }

    const encounters = await this.queryPatientClinicalEncounters(
      {
        sub: patientId,
        hospitalId: scope.hospitalId,
        branchId: scope.branchId,
      },
      patientId,
    );

    return {
      patientId,
      encounters,
    };
  }
}
