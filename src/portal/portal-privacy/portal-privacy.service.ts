import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePatientPrivacyConsentDto } from '../../privacy/dto/create-patient-privacy-consent.dto';
import { PatientPrivacyActor } from '../../privacy/patient-privacy-access.util';
import { PatientPrivacyConsentService } from '../../privacy/patient-privacy-consent.service';
import { PatientPrivacyErasureService } from '../../privacy/patient-privacy-erasure.service';
import { PatientPrivacyExportService } from '../../privacy/patient-privacy-export.service';
import {
  PATIENT_PORTAL_PRIVACY_CONSENT_GRANTED,
  PATIENT_PORTAL_PRIVACY_CONSENT_VIEWED,
  PATIENT_PORTAL_PRIVACY_CONSENT_WITHDRAWN,
  PATIENT_PORTAL_PRIVACY_ERASURE_REQUESTED,
  PATIENT_PORTAL_PRIVACY_ERASURE_VIEWED,
  PATIENT_PORTAL_PRIVACY_EXPORT_REQUESTED,
} from '../portal-audit.actions';
import { PatientPrincipal } from '../portal.types';
import { PortalGrantConsentDto } from './dto/portal-grant-consent.dto';
import { mapPortalConsent, mapPortalErasure } from './portal-privacy.response.mapper';

@Injectable()
export class PortalPrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly consentService: PatientPrivacyConsentService,
    private readonly exportService: PatientPrivacyExportService,
    private readonly erasureService: PatientPrivacyErasureService,
  ) {}

  private privacyActor(principal: PatientPrincipal): PatientPrivacyActor {
    return {
      sub: principal.patientId,
      hospitalId: principal.hospitalId,
      branchId: principal.branchId,
      auditUserId: null,
    };
  }

  private async logPortalAudit(
    principal: PatientPrincipal,
    action: string,
    entity: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: principal.patientId },
      select: { branchId: true },
    });
    await this.auditService.log({
      action,
      entity,
      entityId,
      hospitalId: principal.hospitalId,
      branchId: patient?.branchId ?? null,
      userId: undefined,
      metadata: {
        patientId: principal.patientId,
        ...metadata,
      },
    });
  }

  async listConsents(principal: PatientPrincipal) {
    const rows = await this.consentService.listConsents(
      this.privacyActor(principal),
      principal.patientId,
    );
    await this.logPortalAudit(
      principal,
      PATIENT_PORTAL_PRIVACY_CONSENT_VIEWED,
      'PatientPrivacyConsent',
      principal.patientId,
    );
    return rows.map((row) =>
      mapPortalConsent({
        id: row.id,
        purpose: row.purpose,
        status: row.status,
        grantedAt: row.grantedAt,
        withdrawnAt: row.withdrawnAt,
        relatedGrantId: row.relatedGrantId,
        createdAt: row.createdAt,
      }),
    );
  }

  async grantConsent(principal: PatientPrincipal, dto: PortalGrantConsentDto) {
    const staffDto: CreatePatientPrivacyConsentDto = { purpose: dto.purpose };
    const row = await this.consentService.grantConsent(
      this.privacyActor(principal),
      principal.patientId,
      staffDto,
    );
    await this.logPortalAudit(
      principal,
      PATIENT_PORTAL_PRIVACY_CONSENT_GRANTED,
      'PatientPrivacyConsent',
      row.id,
      { purpose: dto.purpose },
    );
    return mapPortalConsent({
      id: row.id,
      purpose: row.purpose,
      status: row.status,
      grantedAt: row.grantedAt,
      withdrawnAt: row.withdrawnAt,
      relatedGrantId: row.relatedGrantId,
      createdAt: row.createdAt,
    });
  }

  async withdrawConsent(principal: PatientPrincipal, consentId: string) {
    const row = await this.consentService.withdrawConsent(
      this.privacyActor(principal),
      principal.patientId,
      consentId,
    );
    await this.logPortalAudit(
      principal,
      PATIENT_PORTAL_PRIVACY_CONSENT_WITHDRAWN,
      'PatientPrivacyConsent',
      row.id,
      { relatedGrantId: row.relatedGrantId },
    );
    return mapPortalConsent({
      id: row.id,
      purpose: row.purpose,
      status: row.status,
      grantedAt: row.grantedAt,
      withdrawnAt: row.withdrawnAt,
      relatedGrantId: row.relatedGrantId,
      createdAt: row.createdAt,
    });
  }

  async requestExport(principal: PatientPrincipal) {
    const payload = await this.exportService.exportPatientData(
      this.privacyActor(principal),
      principal.patientId,
    );
    await this.logPortalAudit(
      principal,
      PATIENT_PORTAL_PRIVACY_EXPORT_REQUESTED,
      'Patient',
      principal.patientId,
    );
    return payload;
  }

  async getExport(principal: PatientPrincipal) {
    return this.requestExport(principal);
  }

  async getErasureStatus(principal: PatientPrincipal) {
    const row = await this.erasureService.getLatestErasureRequest(
      this.privacyActor(principal),
      principal.patientId,
    );
    if (!row) {
      throw new NotFoundException('Erasure request not found');
    }
    await this.logPortalAudit(
      principal,
      PATIENT_PORTAL_PRIVACY_ERASURE_VIEWED,
      'PatientPrivacyErasureRequest',
      row.id,
    );
    return mapPortalErasure(row);
  }

  async requestErasure(principal: PatientPrincipal) {
    const row = await this.erasureService.requestErasure(
      this.privacyActor(principal),
      principal.patientId,
    );
    await this.logPortalAudit(
      principal,
      PATIENT_PORTAL_PRIVACY_ERASURE_REQUESTED,
      'PatientPrivacyErasureRequest',
      row.id,
    );
    return mapPortalErasure(row);
  }
}
