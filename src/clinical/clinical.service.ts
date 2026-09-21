import {
  BadRequestException,
  ConflictException,
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
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdateDiagnosisDto } from './dto/update-diagnosis.dto';
import { UpdatePrescriptionStatusDto } from './dto/update-prescription-status.dto';
import { UpsertSoapDto } from './dto/upsert-soap.dto';
import { isAllowedEncounterTransition } from './utils/encounter-transitions.util';
import { validateIcd10Code } from './utils/icd10-format.util';
import { checkDocumentedAllergies } from './utils/medication-safety.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
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

@Injectable()
export class ClinicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

    return patient;
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
    return this.findOwnedEncounter(user, encounterId);
  }

  async listEncounters(user: AuthenticatedUser, patientId?: string) {
    if (patientId) {
      await this.validatePatient(user, patientId);
    }

    return this.prisma.clinicalEncounter.findMany({
      where: {
        hospitalId: user.hospitalId,
        ...(patientId !== undefined && { patientId }),
      },
      include: encounterInclude,
      orderBy: { startedAt: 'desc' },
    });
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

    const existing = await this.prisma.clinicalSoapNote.findUnique({
      where: { encounterId },
    });

    if (existing) {
      const updated = await this.prisma.clinicalSoapNote.update({
        where: { encounterId },
        data: {
          ...(dto.subjective !== undefined && { subjective: dto.subjective }),
          ...(dto.objective !== undefined && { objective: dto.objective }),
          ...(dto.assessment !== undefined && { assessment: dto.assessment }),
          ...(dto.plan !== undefined && { plan: dto.plan }),
        },
      });

      await this.auditService.log({
        action: 'CLINICAL_SOAP_UPDATED',
        entity: 'ClinicalSoapNote',
        entityId: updated.id,
        hospitalId: user.hospitalId,
        branchId: encounter.branchId,
        userId: user.sub,
        metadata: {
          encounterId,
          encounterStatus: encounter.status,
        },
      });

      return updated;
    }

    const created = await this.prisma.clinicalSoapNote.create({
      data: {
        hospitalId: user.hospitalId,
        encounterId,
        subjective: dto.subjective,
        objective: dto.objective,
        assessment: dto.assessment,
        plan: dto.plan,
        createdByUserId: user.sub,
      },
    });

    await this.auditService.log({
      action: 'CLINICAL_SOAP_CREATED',
      entity: 'ClinicalSoapNote',
      entityId: created.id,
      hospitalId: user.hospitalId,
      branchId: encounter.branchId,
      userId: user.sub,
      metadata: { encounterId },
    });

    return created;
  }

  async getSoap(user: AuthenticatedUser, encounterId: string) {
    await this.findOwnedEncounter(user, encounterId);

    const soap = await this.prisma.clinicalSoapNote.findUnique({
      where: { encounterId },
    });

    if (!soap || soap.hospitalId !== user.hospitalId) {
      throw new NotFoundException('SOAP note not found');
    }

    return soap;
  }

  async createDiagnosis(
    user: AuthenticatedUser,
    encounterId: string,
    dto: CreateDiagnosisDto,
  ) {
    const encounter = await this.findOwnedEncounter(user, encounterId);
    this.assertEncounterModifiable(encounter.status);

    let code: string;

    try {
      code = validateIcd10Code(dto.code);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid ICD-10 code',
      );
    }

    const diagnosis = await this.prisma.clinicalDiagnosis.create({
      data: {
        hospitalId: user.hospitalId,
        encounterId,
        code,
        description: dto.description.trim(),
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
    await this.findOwnedEncounter(user, encounterId);

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

    this.assertEncounterModifiable(existing.encounter.status);

    let code = existing.code;

    if (dto.code !== undefined) {
      try {
        code = validateIcd10Code(dto.code);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid ICD-10 code',
        );
      }
    }

    const updated = await this.prisma.clinicalDiagnosis.update({
      where: { id: diagnosisId },
      data: {
        ...(dto.code !== undefined && { code }),
        ...(dto.description !== undefined && {
          description: dto.description.trim(),
        }),
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
    const allergyWarnings = checkDocumentedAllergies(
      patient.allergies,
      dto.items.map((item) => item.medicationName),
    );

    const prescription = await this.prisma.prescription.create({
      data: {
        hospitalId: user.hospitalId,
        encounterId,
        patientId: encounter.patientId,
        prescribedByUserId: user.sub,
        notes: dto.notes,
        items: {
          create: dto.items.map((item) => ({
            medicationName: item.medicationName.trim(),
            dosage: item.dosage,
            route: item.route,
            frequency: item.frequency,
            duration: item.duration,
            instructions: item.instructions,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    await this.auditService.log({
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

    return {
      ...prescription,
      allergyWarnings,
      interactionCheckAvailable: false,
    };
  }

  async listPrescriptions(user: AuthenticatedUser, encounterId: string) {
    await this.findOwnedEncounter(user, encounterId);

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

    if (existing.status === dto.status) {
      return this.getPrescription(user, prescriptionId);
    }

    if (
      existing.status === PrescriptionStatus.CANCELLED ||
      existing.status === PrescriptionStatus.COMPLETED
    ) {
      throw new BadRequestException('Terminal prescriptions cannot change status');
    }

    const updated = await this.prisma.prescription.update({
      where: { id: prescriptionId },
      data: { status: dto.status },
      include: { items: true },
    });

    await this.auditService.log({
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

    return updated;
  }

  async getPatientClinicalRecords(user: AuthenticatedUser, patientId: string) {
    await this.validatePatient(user, patientId);

    const encounters = await this.prisma.clinicalEncounter.findMany({
      where: {
        hospitalId: user.hospitalId,
        patientId,
      },
      include: encounterInclude,
      orderBy: { startedAt: 'desc' },
    });

    return {
      patientId,
      encounters,
    };
  }
}
