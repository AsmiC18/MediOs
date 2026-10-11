import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PatientPrivacyConsentStatus,
  PatientPrivacyConsentType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePatientPrivacyConsentDto } from './dto/create-patient-privacy-consent.dto';
import {
  PATIENT_PRIVACY_CONSENT_GRANTED,
  PATIENT_PRIVACY_CONSENT_WITHDRAWN,
} from './patient-privacy-audit.actions';
import {
  assertPatientNotAnonymized,
  findOwnedPatientForPrivacy,
  PatientPrivacyActor,
  resolvePrivacyAuditUserId,
  resolvePrivacyRecordedByUserId,
} from './patient-privacy-access.util';

@Injectable()
export class PatientPrivacyConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listConsents(user: PatientPrivacyActor, patientId: string) {
    await findOwnedPatientForPrivacy(this.prisma, user, patientId);

    const rows = await this.prisma.patientPrivacyConsent.findMany({
      where: { hospitalId: user.hospitalId, patientId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map((row) => this.toResponse(row));
  }

  async grantConsent(
    user: PatientPrivacyActor,
    patientId: string,
    dto: CreatePatientPrivacyConsentDto,
  ) {
    const patient = await findOwnedPatientForPrivacy(
      this.prisma,
      user,
      patientId,
    );
    assertPatientNotAnonymized(patient);

    const version = dto.version?.trim() || '1';
    const now = new Date();

    const consent = await this.prisma.patientPrivacyConsent.create({
      data: {
        hospitalId: user.hospitalId,
        patientId,
        consentType: PatientPrivacyConsentType.PATIENT_PRIVACY,
        purpose: dto.purpose,
        status: PatientPrivacyConsentStatus.GRANTED,
        version,
        grantedAt: now,
        recordedByUserId: resolvePrivacyRecordedByUserId(user),
      },
    });

    await this.auditService.log({
      action: PATIENT_PRIVACY_CONSENT_GRANTED,
      entity: 'PatientPrivacyConsent',
      entityId: consent.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: resolvePrivacyAuditUserId(user),
      metadata: {
        patientId,
        purpose: dto.purpose,
        version,
      },
    });

    return this.toResponse(consent);
  }

  async withdrawConsent(
    user: PatientPrivacyActor,
    patientId: string,
    consentId: string,
  ) {
    const patient = await findOwnedPatientForPrivacy(
      this.prisma,
      user,
      patientId,
    );
    assertPatientNotAnonymized(patient);

    const grant = await this.prisma.patientPrivacyConsent.findFirst({
      where: {
        id: consentId,
        hospitalId: user.hospitalId,
        patientId,
        status: PatientPrivacyConsentStatus.GRANTED,
      },
    });

    if (!grant) {
      throw new NotFoundException('Consent grant not found');
    }

    const now = new Date();
    const withdrawal = await this.prisma.patientPrivacyConsent.create({
      data: {
        hospitalId: user.hospitalId,
        patientId,
        consentType: grant.consentType,
        purpose: grant.purpose,
        status: PatientPrivacyConsentStatus.WITHDRAWN,
        version: grant.version,
        withdrawnAt: now,
        relatedGrantId: grant.id,
        recordedByUserId: resolvePrivacyRecordedByUserId(user),
      },
    });

    await this.auditService.log({
      action: PATIENT_PRIVACY_CONSENT_WITHDRAWN,
      entity: 'PatientPrivacyConsent',
      entityId: withdrawal.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: resolvePrivacyAuditUserId(user),
      metadata: {
        patientId,
        relatedGrantId: grant.id,
        purpose: grant.purpose,
      },
    });

    return this.toResponse(withdrawal);
  }

  private toResponse(row: {
    id: string;
    hospitalId: string;
    patientId: string;
    consentType: PatientPrivacyConsentType;
    purpose: string;
    status: PatientPrivacyConsentStatus;
    version: string;
    grantedAt: Date | null;
    withdrawnAt: Date | null;
    relatedGrantId: string | null;
    recordedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      patientId: row.patientId,
      consentType: row.consentType,
      purpose: row.purpose,
      status: row.status,
      version: row.version,
      grantedAt: row.grantedAt?.toISOString() ?? null,
      withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
      relatedGrantId: row.relatedGrantId,
      recordedByUserId: row.recordedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
