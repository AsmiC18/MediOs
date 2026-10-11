import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JobService } from '../jobs/job.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { PatientPrivacyExportService } from '../privacy/patient-privacy-export.service';
import { PatientsService } from '../patients/patients.service';
import { UnavailableDrugInteractionAdapter } from './adapters/unavailable-drug-interaction.adapter';
import { ClinicalService } from './clinical.service';
import { ClinicalDrugService } from './drugs/clinical-drug.service';
import { ClinicalPrescriptionOutboxService } from './events/clinical-prescription-outbox.service';
import { Icd10Service } from './icd10/icd10.service';
import { ClinicalSafetyPolicyService } from './safety/clinical-safety-policy.service';
import { PrescriptionSafetyService } from './safety/prescription-safety.service';

describe('Clinical SOAP version history', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let otherHospitalId: string;
  let branchId: string;
  let otherBranchId: string;
  let userId: string;
  let roleId: string;
  let patientId: string;
  let encounterId: string;

  let clinicalService: ClinicalService;
  let exportService: PatientPrivacyExportService;
  let patientsService: PatientsService;

  const hospitalWideUser = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
    roleId,
  });

  const branchUser = (branch: string) => ({
    sub: userId,
    hospitalId,
    branchId: branch,
    roleId,
  });

  const otherHospitalUser = () => ({
    sub: userId,
    hospitalId: otherHospitalId,
    branchId: null as string | null,
    roleId,
  });

  const itDb = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const auditService = new AuditService(prisma as never);
    const jobService = new JobService(prisma as never);
    const domainEventOutboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    const clinicalPrescriptionOutboxService = new ClinicalPrescriptionOutboxService(
      domainEventOutboxService,
    );
    const clinicalDrugService = new ClinicalDrugService(prisma as never);
    const policyService = new ClinicalSafetyPolicyService(prisma as never);
    const prescriptionSafetyService = new PrescriptionSafetyService(
      prisma as never,
      clinicalDrugService,
      policyService,
      new UnavailableDrugInteractionAdapter(),
    );
    clinicalService = new ClinicalService(
      prisma as never,
      auditService,
      prescriptionSafetyService,
      clinicalPrescriptionOutboxService,
      new Icd10Service(prisma as never),
    );
    exportService = new PatientPrivacyExportService(prisma as never, auditService);
    patientsService = new PatientsService(
      prisma as never,
      auditService,
      {
        isWhatsAppTransactionalEnabled: jest.fn().mockResolvedValue(true),
        upsertWhatsAppTransactionalEnabled: jest.fn(),
      } as never,
      {
        syncFromAtRiskEvaluation: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    const hospital = await prisma.hospital.create({
      data: { name: `SOAP ${runId}`, code: `SOAP-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `SOAP-O ${runId}`, code: `SOAP-O-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;

    const otherBranch = await prisma.branch.create({
      data: { hospitalId, name: 'Other', code: `BR2-${runId}` },
    });
    otherBranchId = otherBranch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Role-${runId}` },
    });
    roleId = role.id;

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId,
        name: 'Clinician',
        email: `soap-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = admin.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Pat',
        lastName: runId,
        phone: `9${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;

    const encounter = await prisma.clinicalEncounter.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        providerUserId: userId,
        encounterType: ClinicalEncounterType.OPD,
        status: ClinicalEncounterStatus.OPEN,
      },
    });
    encounterId = encounter.id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  describe('versioning', () => {
    itDb('creates current SOAP and version 1 on initial save', async () => {
      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      const soap = await clinicalService.createOrUpdateSoap(
        hospitalWideUser(),
        enc.id,
        {
          subjective: 'Initial subjective',
          plan: 'Initial plan',
        },
      );

      expect(soap.subjective).toBe('Initial subjective');

      const versions = await prisma.clinicalSoapNoteVersion.findMany({
        where: { encounterId: enc.id },
        orderBy: { version: 'asc' },
      });
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].subjective).toBe('Initial subjective');
      expect(versions[0].plan).toBe('Initial plan');
    });

    itDb('creates version 2 with new state and preserves version 1', async () => {
      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        subjective: 'v1 subjective',
      });
      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        subjective: 'v2 subjective',
      });

      const current = await clinicalService.getSoap(hospitalWideUser(), enc.id);
      expect(current.subjective).toBe('v2 subjective');

      const versions = await prisma.clinicalSoapNoteVersion.findMany({
        where: { encounterId: enc.id },
        orderBy: { version: 'asc' },
      });
      expect(versions.map((v) => v.version)).toEqual([1, 2]);
      expect(versions[0].subjective).toBe('v1 subjective');
      expect(versions[1].subjective).toBe('v2 subjective');
    });

    itDb('tracks three sequential updates', async () => {
      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'step-1',
      });
      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'step-2',
      });
      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'step-3',
      });

      const versions = await prisma.clinicalSoapNoteVersion.findMany({
        where: { encounterId: enc.id },
        orderBy: { version: 'asc' },
      });
      expect(versions.map((v) => v.plan)).toEqual(['step-1', 'step-2', 'step-3']);
    });

    itDb('does not create a version for identical content', async () => {
      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        assessment: 'same',
      });
      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        assessment: 'same',
      });

      const count = await prisma.clinicalSoapNoteVersion.count({
        where: { encounterId: enc.id },
      });
      expect(count).toBe(1);
    });
  });

  describe('history API', () => {
    itDb('returns paginated versions newest first', async () => {
      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'a',
      });
      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'b',
      });
      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'c',
      });

      const page1 = await clinicalService.listSoapVersions(
        hospitalWideUser(),
        enc.id,
        { page: 1, limit: 2 },
      );
      expect(page1.meta.total).toBe(3);
      expect(page1.meta.limit).toBe(2);
      expect(page1.data.map((v) => v.version)).toEqual([3, 2]);

      const page2 = await clinicalService.listSoapVersions(
        hospitalWideUser(),
        enc.id,
        { page: 2, limit: 2 },
      );
      expect(page2.data.map((v) => v.version)).toEqual([1]);
    });
  });

  describe('security', () => {
    itDb('denies cross-hospital version listing', async () => {
      await expect(
        clinicalService.listSoapVersions(otherHospitalUser(), encounterId),
      ).rejects.toThrow(NotFoundException);
    });

    itDb('denies cross-branch SOAP update on another branch encounter', async () => {
      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId: otherBranchId,
          patientId,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await expect(
        clinicalService.createOrUpdateSoap(branchUser(branchId), enc.id, {
          plan: 'blocked',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('completed encounter', () => {
    itDb('still allows SOAP updates and preserves history', async () => {
      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'before complete',
      });
      await clinicalService.completeEncounter(hospitalWideUser(), enc.id);
      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'after complete',
      });

      const versions = await prisma.clinicalSoapNoteVersion.findMany({
        where: { encounterId: enc.id },
        orderBy: { version: 'asc' },
      });
      expect(versions.map((v) => v.plan)).toEqual([
        'before complete',
        'after complete',
      ]);
    });
  });

  describe('concurrency', () => {
    itDb('serializes concurrent updates into distinct versions', async () => {
      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'base',
      });

      await Promise.all([
        clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
          subjective: 'race-a',
        }),
        clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
          objective: 'race-b',
        }),
      ]);

      const versions = await prisma.clinicalSoapNoteVersion.findMany({
        where: { encounterId: enc.id },
        orderBy: { version: 'asc' },
      });
      expect(versions.length).toBeGreaterThanOrEqual(3);
      expect(new Set(versions.map((v) => v.version)).size).toBe(versions.length);
    });
  });

  describe('privacy export', () => {
    itDb('includes SOAP version history on clinical encounters', async () => {
      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'export-v1',
      });
      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'export-v2',
      });

      const payload = (await exportService.exportPatientData(
        { sub: userId, hospitalId, branchId: null },
        patientId,
      )) as {
        clinicalEncounters: Array<{
          id: string;
          soapNoteVersions: Array<{ version: number; plan: string | null }>;
        }>;
      };

      const exported = payload.clinicalEncounters.find((e) => e.id === enc.id);
      expect(exported).toBeDefined();
      expect(exported!.soapNoteVersions.length).toBe(2);
      expect(exported!.soapNoteVersions.map((v) => v.plan)).toEqual([
        'export-v1',
        'export-v2',
      ]);
    });
  });

  describe('patient merge', () => {
    itDb('keeps SOAP versions on the encounter after merge', async () => {
      const source = await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'Src',
          lastName: runId,
          phone: `1${runId.slice(-9)}`,
        },
      });
      const target = await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'Tgt',
          lastName: runId,
          phone: `2${runId.slice(-9)}`,
        },
      });

      const enc = await prisma.clinicalEncounter.create({
        data: {
          hospitalId,
          branchId,
          patientId: source.id,
          providerUserId: userId,
          encounterType: ClinicalEncounterType.OPD,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await clinicalService.createOrUpdateSoap(hospitalWideUser(), enc.id, {
        plan: 'merge-test',
      });

      await patientsService.mergePatients(
        hospitalWideUser(),
        source.id,
        target.id,
      );

      const moved = await prisma.clinicalEncounter.findUnique({
        where: { id: enc.id },
      });
      expect(moved!.patientId).toBe(target.id);

      const versions = await prisma.clinicalSoapNoteVersion.findMany({
        where: { encounterId: enc.id },
      });
      expect(versions).toHaveLength(1);
      expect(versions[0].plan).toBe('merge-test');
    });
  });
});
