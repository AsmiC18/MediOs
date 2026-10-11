import {
  AppointmentStatus,
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  DiagnosticOrderStatus,
  PrescriptionStatus,
  PrismaClient,
} from '@prisma/client';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { AuditService } from '../../audit/audit.service';
import { toStaffJwtUser } from '../../auth/staff-jwt-payload.util';
import { ClinicalService } from '../../clinical/clinical.service';
import { Icd10Service } from '../../clinical/icd10/icd10.service';
import { ClinicalDrugService } from '../../clinical/drugs/clinical-drug.service';
import { UnavailableDrugInteractionAdapter } from '../../clinical/adapters/unavailable-drug-interaction.adapter';
import { ClinicalPrescriptionOutboxService } from '../../clinical/events/clinical-prescription-outbox.service';
import { ClinicalSafetyPolicyService } from '../../clinical/safety/clinical-safety-policy.service';
import { PrescriptionSafetyService } from '../../clinical/safety/prescription-safety.service';
import { canonicalizePatientPhone } from '../../common/utils/phone.util';
import { DepartmentBillingEnqueueService } from '../../billing/department/department-billing-enqueue.service';
import { DiagnosticsService } from '../../diagnostics/diagnostics.service';
import { JobService } from '../../jobs/job.service';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { PatientTimelineCategory } from '../../patients/dto/patient-timeline-query.dto';
import { PatientTimelineService } from '../../patients/patient-timeline.service';
import { PortalPrincipalGuard } from '../portal-auth/guards/portal-principal.guard';
import { toPatientPrincipal } from '../portal-auth/portal-jwt-payload.util';
import { PATIENT_PRINCIPAL_TYPE, PatientPrincipal } from '../portal.types';
import { PortalPatientRecordsService } from './portal-patient-records.service';

const SENSITIVE_FIELD_NAMES = [
  'passwordHash',
  'storageKey',
  'linkToken',
  'refreshToken',
  'accessToken',
  'mergedIntoPatientId',
  'anonymizedAt',
  'prescribedByUserId',
  'providerUserId',
  'orderedByUserId',
  'createdByUserId',
];

function assertNoSensitiveFields(value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => assertNoSensitiveFields(entry));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      expect(SENSITIVE_FIELD_NAMES).not.toContain(key);
      assertNoSensitiveFields(nested);
    }
  }
}

describe('Patient portal records integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let otherHospitalId: string;
  let branchId: string;
  let staffUserId: string;
  let staffRoleId: string;

  let patientAId: string;
  let patientBId: string;
  let otherHospitalPatientId: string;

  let encounterAId: string;
  let encounterBId: string;
  let prescriptionAId: string;
  let diagnosticAId: string;

  let recordsService: PortalPatientRecordsService;
  let timelineService: PatientTimelineService;
  let clinicalService: ClinicalService;
  let diagnosticsService: DiagnosticsService;
  let portalPrincipalGuard: PortalPrincipalGuard;

  const principalA = (): PatientPrincipal => ({
    principalType: PATIENT_PRINCIPAL_TYPE,
    patientId: patientAId,
    hospitalId,
    branchId,
  });

  const staffUser = () => ({
    sub: staffUserId,
    hospitalId,
    branchId: null as string | null,
    roleId: staffRoleId,
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const audit = new AuditService(prisma as never);
    const jobService = new JobService(prisma as never);
    const outbox = new DomainEventOutboxService(prisma as never, jobService);
    timelineService = new PatientTimelineService(prisma as never, {
      log: jest.fn(),
    } as never);
    const departmentBillingEnqueue = new DepartmentBillingEnqueueService(
      prisma as never,
      outbox,
      jobService,
      audit,
    );
    diagnosticsService = new DiagnosticsService(
      prisma as never,
      audit,
      outbox,
      departmentBillingEnqueue,
    );
    const clinicalPrescriptionOutbox = new ClinicalPrescriptionOutboxService(outbox);
    const clinicalDrugService = new ClinicalDrugService(prisma as never);
    const policyService = new ClinicalSafetyPolicyService(prisma as never);
    const prescriptionSafety = new PrescriptionSafetyService(
      prisma as never,
      clinicalDrugService,
      policyService,
      new UnavailableDrugInteractionAdapter(),
    );
    clinicalService = new ClinicalService(
      prisma as never,
      audit,
      prescriptionSafety,
      clinicalPrescriptionOutbox,
      new Icd10Service(prisma as never),
    );
    recordsService = new PortalPatientRecordsService(
      timelineService,
      clinicalService,
      diagnosticsService,
      prisma as never,
      audit,
    );
    portalPrincipalGuard = new PortalPrincipalGuard(prisma as never);

    const hospital = await prisma.hospital.create({
      data: { name: `PR3 ${runId}`, code: `PR3-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `PR3O ${runId}`, code: `PR3O-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    branchId = (
      await prisma.branch.create({
        data: { hospitalId, name: 'Main', code: `PR3B-${runId}` },
      })
    ).id;

    staffRoleId = (
      await prisma.role.create({
        data: { hospitalId, name: `PR3R-${runId}` },
      })
    ).id;

    staffUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          branchId,
          roleId: staffRoleId,
          name: 'Staff',
          email: `pr3-${runId}@example.com`,
          passwordHash: 'hash',
        },
      })
    ).id;

    patientAId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'PortalA',
          lastName: runId,
          phone: canonicalizePatientPhone(`9${runId.replace(/\D/g, '').slice(-9)}`),
        },
      })
    ).id;

    patientBId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'PortalB',
          lastName: runId,
          phone: canonicalizePatientPhone(`8${runId.replace(/\D/g, '').slice(-9)}`),
        },
      })
    ).id;

    otherHospitalPatientId = (
      await prisma.patient.create({
        data: {
          hospitalId: otherHospitalId,
          firstName: 'OtherH',
          lastName: runId,
          phone: canonicalizePatientPhone(`7${runId.replace(/\D/g, '').slice(-9)}`),
        },
      })
    ).id;

    await prisma.appointment.create({
      data: {
        hospitalId,
        branchId,
        patientId: patientAId,
        startAt: new Date('2027-01-15T10:00:00.000Z'),
        endAt: new Date('2027-01-15T10:30:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
      },
    });

    encounterAId = (
      await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId: patientAId,
          providerUserId: staffUserId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      })
    ).id;

    encounterBId = (
      await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId: patientBId,
          providerUserId: staffUserId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      })
    ).id;

    await prisma.clinicalSoapNote.create({
      data: {
        hospitalId,
        encounterId: encounterAId,
        createdByUserId: staffUserId,
        subjective: 'Headache',
        objective: 'Stable vitals',
        assessment: 'Tension headache',
        plan: 'Rest',
      },
    });

    prescriptionAId = (
      await prisma.prescription.create({
        data: {
          hospitalId,
          patientId: patientAId,
          encounterId: encounterAId,
          prescribedByUserId: staffUserId,
          status: PrescriptionStatus.ACTIVE,
          items: {
            create: [
              {
                medicationName: 'Paracetamol 500mg',
                dosage: '500mg',
                frequency: 'Twice daily',
                duration: '5 days',
              },
            ],
          },
        },
      })
    ).id;

    await prisma.patientPortalAccount.create({
      data: {
        patientId: patientAId,
        hospitalId,
        passwordHash: '$2b$12$testportalaccounthash000000000000',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    diagnosticAId = (
      await prisma.diagnosticOrder.create({
        data: {
          hospitalId,
          branchId,
          patientId: patientAId,
          encounterId: encounterAId,
          orderNumber: `PR3-LAB-${runId}`,
          orderedByUserId: staffUserId,
          status: DiagnosticOrderStatus.ORDERED,
          orderedAt: new Date('2027-01-16T09:00:00.000Z'),
          items: {
            create: [
              {
                hospitalId,
                testCode: 'CBC',
                testName: 'Complete Blood Count',
                specimenType: 'Blood',
              },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (!dbAvailable || !hospitalId) {
      return;
    }
    await prisma.hospital.deleteMany({
      where: { id: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.$disconnect();
  });

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  itDb('returns own timeline with expected categories and pagination', async () => {
    const timeline = await recordsService.getTimeline(principalA(), {
      limit: 50,
    });
    expect(timeline.patientId).toBe(patientAId);
    expect(timeline.data.length).toBeGreaterThan(0);
    const types = new Set(timeline.data.map((item) => item.eventType));
    expect(types.has('patient.appointment.scheduled')).toBe(true);
    expect(types.has('patient.prescription.created')).toBe(true);
    expect(types.has('patient.diagnostic.ordered')).toBe(true);

    const paged = await recordsService.getTimeline(principalA(), {
      page: 1,
      limit: 1,
    });
    expect(paged.meta.limit).toBe(1);
    expect(paged.data).toHaveLength(1);

    const filtered = await recordsService.getTimeline(principalA(), {
      category: PatientTimelineCategory.APPOINTMENT,
    });
    expect(filtered.data.every((e) => e.eventType === 'patient.appointment.scheduled')).toBe(
      true,
    );
  });

  itDb('timeline is scoped to authenticated patient and hospital', async () => {
    const timelineA = await recordsService.getTimeline(principalA(), {});
    expect(timelineA.patientId).toBe(patientAId);
    expect(
      timelineA.data.some((e) => e.entityId === encounterBId),
    ).toBe(false);
  });

  itDb('returns own clinical records without staff-only fields', async () => {
    const records = await recordsService.getClinicalRecords(principalA());
    expect(records.patientId).toBe(patientAId);
    expect(records.encounters.some((e) => e.id === encounterAId)).toBe(true);
    expect(records.encounters.some((e) => e.id === encounterBId)).toBe(false);
    assertNoSensitiveFields(records);
    expect(JSON.stringify(records)).not.toMatch(/storageKey|linkToken|passwordHash/i);
  });

  itDb('returns own prescriptions and hides other patients', async () => {
    await prisma.prescription.create({
      data: {
        hospitalId,
        patientId: patientBId,
        encounterId: encounterBId,
        prescribedByUserId: staffUserId,
        status: PrescriptionStatus.ACTIVE,
      },
    });

    const list = await recordsService.getPrescriptions(principalA());
    expect(list.items.some((p) => p.id === prescriptionAId)).toBe(true);
    expect(list.items.every((p) => p.id === prescriptionAId)).toBe(true);
    assertNoSensitiveFields(list);
  });

  itDb('returns own diagnostics with hospital isolation', async () => {
    const diagnostics = await recordsService.getDiagnostics(principalA());
    expect(diagnostics.patientId).toBe(patientAId);
    expect(diagnostics.orders.some((o) => o.id === diagnosticAId)).toBe(true);
    assertNoSensitiveFields(diagnostics);

    await expect(
      diagnosticsService.getPatientDiagnosticsForPortal(
        { hospitalId, branchId: null },
        otherHospitalPatientId,
      ),
    ).rejects.toThrow();
  });

  itDb('rejects staff JWT shape on portal principal parsing', async () => {
    expect(() =>
      toPatientPrincipal({
        principalType: 'STAFF',
        sub: staffUserId,
        hospitalId,
        roleId: staffRoleId,
        role: 'ADMIN',
      } as never),
    ).toThrow(UnauthorizedException);

    expect(() =>
      toStaffJwtUser({
        principalType: PATIENT_PRINCIPAL_TYPE,
        sub: patientAId,
        hospitalId,
        branchId,
      }),
    ).toThrow(UnauthorizedException);
  });

  itDb('rejects anonymized patient for portal records guard', async () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: principalA() }),
      }),
    } as ExecutionContext;

    await expect(portalPrincipalGuard.canActivate(ctx)).resolves.toBe(true);

    await prisma.patient.update({
      where: { id: patientAId },
      data: { anonymizedAt: new Date() },
    });

    await expect(portalPrincipalGuard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    await prisma.patient.update({
      where: { id: patientAId },
      data: { anonymizedAt: null },
    });
  });

  itDb('staff record APIs still work unchanged', async () => {
    const staffTimeline = await timelineService.getTimeline(
      staffUser(),
      patientAId,
      { limit: 10 },
    );
    expect(staffTimeline.patientId).toBe(patientAId);

    const staffClinical = await clinicalService.getPatientClinicalRecords(
      staffUser(),
      patientAId,
    );
    expect(staffClinical.encounters.length).toBeGreaterThan(0);

    const staffDiagnostics = await diagnosticsService.getPatientDiagnostics(
      staffUser(),
      patientAId,
    );
    expect(staffDiagnostics.orders.some((o) => o.id === diagnosticAId)).toBe(true);
  });
});
