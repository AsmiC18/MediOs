import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { ClinicalService } from '../../clinical/clinical.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DiagnosticsService } from '../../diagnostics/diagnostics.service';
import { PatientTimelineService } from '../../patients/patient-timeline.service';
import { PortalTimelineQueryDto } from './dto/portal-timeline-query.dto';
import { PATIENT_PORTAL_RECORD_VIEWED } from '../portal-audit.actions';
import { PatientPrincipal } from '../portal.types';
import {
  mapPortalClinicalRecords,
  mapPortalDiagnostics,
  mapPortalPrescriptionsList,
} from './portal-record-response.mapper';
import { portalHospitalScope, portalPrincipalToScopeUser } from './portal-scope.util';

export type PortalRecordSection =
  | 'timeline'
  | 'clinical-records'
  | 'prescriptions'
  | 'diagnostics';

@Injectable()
export class PortalPatientRecordsService {
  constructor(
    private readonly patientTimelineService: PatientTimelineService,
    private readonly clinicalService: ClinicalService,
    private readonly diagnosticsService: DiagnosticsService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async auditRecordView(
    principal: PatientPrincipal,
    section: PortalRecordSection,
  ) {
    await this.auditService.log({
      action: PATIENT_PORTAL_RECORD_VIEWED,
      entity: 'Patient',
      entityId: principal.patientId,
      hospitalId: principal.hospitalId,
      branchId: principal.branchId,
      metadata: { section },
    });
  }

  async getTimeline(principal: PatientPrincipal, query: PortalTimelineQueryDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const timelineQuery = { ...query, limit };

    const timeline = await this.patientTimelineService.getTimeline(
      portalPrincipalToScopeUser(principal),
      principal.patientId,
      timelineQuery,
    );

    await this.auditRecordView(principal, 'timeline');

    return timeline;
  }

  async getClinicalRecords(principal: PatientPrincipal) {
    const raw = await this.clinicalService.getPatientClinicalRecordsForPortal(
      portalHospitalScope(principal),
      principal.patientId,
    );

    await this.auditRecordView(principal, 'clinical-records');

    return mapPortalClinicalRecords(
      raw as Parameters<typeof mapPortalClinicalRecords>[0],
    );
  }

  async getPrescriptions(principal: PatientPrincipal) {
    const rows = await this.prisma.prescription.findMany({
      where: {
        hospitalId: principal.hospitalId,
        patientId: principal.patientId,
      },
      include: {
        items: { include: { clinicalDrug: true } },
        encounter: { select: { startedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.auditRecordView(principal, 'prescriptions');

    return mapPortalPrescriptionsList(rows);
  }

  async getDiagnostics(principal: PatientPrincipal) {
    const raw = await this.diagnosticsService.getPatientDiagnosticsForPortal(
      portalHospitalScope(principal),
      principal.patientId,
    );

    await this.auditRecordView(principal, 'diagnostics');

    return mapPortalDiagnostics(raw);
  }
}
