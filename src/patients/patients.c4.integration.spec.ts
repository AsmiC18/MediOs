import {
  AbhaLinkStatus,
  AppointmentStatus,
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  DiagnosticOrderStatus,
  InsuranceClaimStatus,
  InsuranceProviderType,
  InvoiceStatus,
  PatientAtRiskStatus,
  PrescriptionStatus,
  PrismaClient,
} from '@prisma/client';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuditService } from '../audit/audit.service';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';
import { PatientTimelineCategory } from './dto/patient-timeline-query.dto';
import { PatientTimelineQueryDto } from './dto/patient-timeline-query.dto';
import { PATIENT_TIMELINE_EVENT } from './patient-timeline.types';
import { PatientTimelineService } from './patient-timeline.service';
import { PatientsService } from './patients.service';
import * as atRiskUtil from './patient-at-risk-evaluation.util';

describe('Patient CRM C4 integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchA: string;
  let branchB: string;
  let otherHospitalId: string;
  let userId: string;
  let patientId: string;
  let patientBranchBId: string;

  let patientsService: PatientsService;
  let timelineService: PatientTimelineService;

  const hospitalUser = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  const branchAUser = () => ({
    sub: userId,
    hospitalId,
    branchId: branchA,
  });

  const otherHospitalUser = () => ({
    sub: userId,
    hospitalId: otherHospitalId,
    branchId: null as string | null,
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
    const pref = {
      isWhatsAppTransactionalEnabled: jest.fn().mockResolvedValue(true),
      upsertWhatsAppTransactionalEnabled: jest.fn(),
    };
    patientsService = new PatientsService(prisma as never, audit, pref as never, {
      syncFromAtRiskEvaluation: jest.fn().mockResolvedValue(undefined),
    } as never);
    timelineService = new PatientTimelineService(prisma as never, {
      log: jest.fn(),
    } as never);

    const hospital = await prisma.hospital.create({
      data: { name: `C4 ${runId}`, code: `C4-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `C4O ${runId}`, code: `C4O-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    branchA = (
      await prisma.branch.create({
        data: { hospitalId, name: 'A', code: `CA-${runId}` },
      })
    ).id;

    branchB = (
      await prisma.branch.create({
        data: { hospitalId, name: 'B', code: `CB-${runId}` },
      })
    ).id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `R-${runId}` },
    });

    const user = await prisma.user.create({
      data: {
        hospitalId,
        branchId: branchA,
        roleId: role.id,
        name: 'Staff',
        email: `c4-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = user.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId: branchA,
        firstName: 'Timeline',
        lastName: runId,
        phone: `8${runId.slice(-9)}`,
        isAtRisk: true,
        atRiskStatus: PatientAtRiskStatus.AT_RISK,
        suggestedAction: 'Schedule follow-up',
        daysSinceLastVisit: 40,
        averageVisitCadenceDays: 30,
        atRiskEvaluatedAt: new Date(),
      },
    });
    patientId = patient.id;

    patientBranchBId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId: branchB,
          firstName: 'OtherBranch',
          lastName: runId,
          phone: `7${runId.slice(-9)}`,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  async function seedTimelineFixtures(forPatientId: string) {
    const appt = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId: forPatientId,
        startAt: new Date('2026-01-10T10:00:00.000Z'),
        endAt: new Date('2026-01-10T10:30:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
      },
    });

    const encounter = await prisma.clinicalEncounter.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId: forPatientId,
        providerUserId: userId,
        encounterType: ClinicalEncounterType.OPD,
        status: ClinicalEncounterStatus.OPEN,
      },
    });

    const rx = await prisma.prescription.create({
      data: {
        hospitalId,
        patientId: forPatientId,
        encounterId: encounter.id,
        prescribedByUserId: userId,
        status: PrescriptionStatus.ACTIVE,
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId: forPatientId,
        invoiceNumber: `INV-C4-${runId}-${forPatientId.slice(0, 4)}`,
        status: InvoiceStatus.ISSUED,
        subtotalAmount: 100,
        taxAmount: 0,
        totalAmount: 100,
        issuedAt: new Date('2026-01-12T12:00:00.000Z'),
      },
    });

    const diagnostic = await prisma.diagnosticOrder.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId: forPatientId,
        encounterId: encounter.id,
        orderNumber: `LAB-C4-${runId}-${forPatientId.slice(0, 8)}`,
        orderedByUserId: userId,
        status: DiagnosticOrderStatus.ORDERED,
        orderedAt: new Date('2026-01-11T09:00:00.000Z'),
      },
    });

    const provider = await prisma.insuranceProvider.create({
      data: {
        hospitalId,
        name: `Prov ${runId}`,
        providerType: InsuranceProviderType.TPA,
      },
    });

    const policy = await prisma.patientInsurancePolicy.create({
      data: {
        hospitalId,
        patientId: forPatientId,
        providerId: provider.id,
        policyNumber: `POL-${runId}-${forPatientId.slice(0, 4)}`,
      },
    });

    const claim = await prisma.insuranceClaim.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId: forPatientId,
        policyId: policy.id,
        providerId: provider.id,
        invoiceId: invoice.id,
        claimNumber: `CLM-${runId}-${forPatientId.slice(0, 4)}`,
        claimedAmount: 100,
        status: InsuranceClaimStatus.SUBMITTED,
        submittedAt: new Date('2026-01-13T08:00:00.000Z'),
      },
    });

    return { appt, rx, invoice, diagnostic, claim, encounter };
  }

  itWithDb('timeline returns all five event types newest-first', async () => {
    await seedTimelineFixtures(patientId);

    const timeline = await timelineService.getTimeline(hospitalUser(), patientId, {
      limit: 50,
    });

    const types = new Set(timeline.data.map((e) => e.eventType));
    expect(types.has(PATIENT_TIMELINE_EVENT.APPOINTMENT_SCHEDULED)).toBe(true);
    expect(types.has(PATIENT_TIMELINE_EVENT.PRESCRIPTION_CREATED)).toBe(true);
    expect(types.has(PATIENT_TIMELINE_EVENT.INVOICE_ISSUED)).toBe(true);
    expect(types.has(PATIENT_TIMELINE_EVENT.DIAGNOSTIC_ORDERED)).toBe(true);
    expect(types.has(PATIENT_TIMELINE_EVENT.INSURANCE_CLAIM_SUBMITTED)).toBe(true);

    for (let i = 1; i < timeline.data.length; i++) {
      expect(
        new Date(timeline.data[i - 1]!.occurredAt).getTime(),
      ).toBeGreaterThanOrEqual(new Date(timeline.data[i]!.occurredAt).getTime());
    }

    const first = timeline.data[0]!;
    expect(first.summary).not.toHaveProperty('items');
    expect(first.summary).not.toHaveProperty('notes');
    expect(JSON.stringify(first)).not.toContain('medicationName');
  });

  itWithDb('timeline supports pagination and category filter', async () => {
    const timeline = await timelineService.getTimeline(hospitalUser(), patientId, {
      category: PatientTimelineCategory.INVOICE,
      page: 1,
      limit: 1,
    });

    expect(timeline.data.length).toBeLessThanOrEqual(1);
    expect(
      timeline.data.every(
        (e) => e.eventType === PATIENT_TIMELINE_EVENT.INVOICE_ISSUED,
      ),
    ).toBe(true);
    expect(timeline.meta.limit).toBe(1);
  });

  itWithDb('timeline date filter excludes out-of-range events', async () => {
    const filtered = await timelineService.getTimeline(hospitalUser(), patientId, {
      from: '2026-01-13T00:00:00.000Z',
      to: '2026-01-14T00:00:00.000Z',
    });

    expect(
      filtered.data.every(
        (e) => e.eventType === PATIENT_TIMELINE_EVENT.INSURANCE_CLAIM_SUBMITTED,
      ),
    ).toBe(true);
  });

  itWithDb('timeline denies cross-hospital access', async () => {
    await expect(
      timelineService.getTimeline(otherHospitalUser(), patientId, {}),
    ).rejects.toThrow(NotFoundException);
  });

  itWithDb('timeline branch user cannot read other-branch patient', async () => {
    await expect(
      timelineService.getTimeline(branchAUser(), patientBranchBId, {}),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects invalid timeline query parameters', async () => {
    const dto = plainToInstance(PatientTimelineQueryDto, {
      from: '2026-02-01',
      to: '2026-01-01',
      limit: 200,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  itWithDb('patient list filters by isAtRisk and exposes stored metadata', async () => {
    const evalSpy = jest.spyOn(atRiskUtil, 'computePatientAtRiskEvaluation');

    const list = await patientsService.findAll(hospitalUser(), {
      isAtRisk: true,
      limit: 100,
    });

    expect(evalSpy).not.toHaveBeenCalled();
    evalSpy.mockRestore();

    const row = list.data.find((p) => p.id === patientId);
    expect(row).toBeDefined();
    expect(row!.suggestedAction).toContain('Schedule follow-up');
    expect(row!.daysSinceLastVisit).toBe(40);
    expect(row!.averageVisitCadenceDays).toBe(30);
    expect(row!.atRiskEvaluatedAt).not.toBeNull();

    const statusList = await patientsService.findAll(hospitalUser(), {
      atRiskStatus: PatientAtRiskStatus.AT_RISK,
      limit: 100,
    });
    expect(statusList.data.some((p) => p.id === patientId)).toBe(true);
  });

  itWithDb('merge moves major records and timeline shows merged invoice', async () => {
    const source = await prisma.patient.create({
      data: {
        hospitalId,
        branchId: branchA,
        firstName: 'Source',
        lastName: runId,
        phone: `6${runId.slice(-9)}`,
      },
    });
    const target = await prisma.patient.create({
      data: {
        hospitalId,
        branchId: branchA,
        firstName: 'Target',
        lastName: runId,
        phone: `5${runId.slice(-9)}`,
      },
    });

    const fixtures = await seedTimelineFixtures(source.id);

    const mergeResult = await patientsService.mergePatients(
      hospitalUser(),
      source.id,
      target.id,
    );

    expect(mergeResult.totalRecordsMoved).toBeGreaterThan(0);
    expect(mergeResult.appointmentsMoved).toBeGreaterThan(0);

    const movedInvoice = await prisma.invoice.findUnique({
      where: { id: fixtures.invoice.id },
    });
    expect(movedInvoice!.patientId).toBe(target.id);

    const movedEncounter = await prisma.clinicalEncounter.findFirst({
      where: { patientId: target.id, id: fixtures.encounter.id },
    });
    expect(movedEncounter).not.toBeNull();

    const timeline = await timelineService.getTimeline(hospitalUser(), target.id, {
      limit: 100,
    });
    expect(timeline.data.some((e) => e.entityId === fixtures.invoice.id)).toBe(
      true,
    );

    const audit = await prisma.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'PATIENT_MERGED',
        entityId: target.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  itWithDb('merge rolls back on ABHA link collision', async () => {
    const source = await prisma.patient.create({
      data: {
        hospitalId,
        branchId: branchA,
        firstName: 'AbhaSrc',
        lastName: runId,
        phone: `4${runId.slice(-9)}`,
      },
    });
    const target = await prisma.patient.create({
      data: {
        hospitalId,
        branchId: branchA,
        firstName: 'AbhaTgt',
        lastName: runId,
        phone: `3${runId.slice(-9)}`,
      },
    });

    await prisma.patientAbhaLink.create({
      data: {
        hospitalId,
        patientId: source.id,
        linkStatus: AbhaLinkStatus.UNLINKED,
      },
    });
    await prisma.patientAbhaLink.create({
      data: {
        hospitalId,
        patientId: target.id,
        linkStatus: AbhaLinkStatus.UNLINKED,
      },
    });

    await expect(
      patientsService.mergePatients(hospitalUser(), source.id, target.id),
    ).rejects.toThrow(ConflictException);

    const sourceRow = await prisma.patient.findUnique({ where: { id: source.id } });
    expect(sourceRow!.mergedIntoPatientId).toBeNull();
  });
});
