import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { ClinicalService } from '../clinical.service';
import { ClinicalPrescriptionOutboxService } from '../events/clinical-prescription-outbox.service';
import { PrescriptionSafetyService } from '../safety/prescription-safety.service';
import { UnavailableDrugInteractionAdapter } from '../adapters/unavailable-drug-interaction.adapter';
import { ClinicalDrugService } from '../drugs/clinical-drug.service';
import { ClinicalSafetyPolicyService } from '../safety/clinical-safety-policy.service';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { JobService } from '../../jobs/job.service';
import {
  ICD10_DEVELOPMENT_FIXTURE,
  upsertDevelopmentIcd10Fixture,
} from './icd10-development-fixture';
import { Icd10Service } from './icd10.service';

describe('ICD-10 catalogue and diagnosis validation', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let otherHospitalId: string;
  let branchId: string;
  let otherBranchId: string;
  let userId: string;
  let patientId: string;
  let encounterId: string;

  let icd10Service: Icd10Service;
  let clinicalService: ClinicalService;

  const hospitalWideUser = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  const branchUser = (branch: string) => ({
    sub: userId,
    hospitalId,
    branchId: branch,
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

    await upsertDevelopmentIcd10Fixture(prisma);

    icd10Service = new Icd10Service(prisma as never);
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
      icd10Service,
    );

    const hospital = await prisma.hospital.create({
      data: { name: `ICD ${runId}`, code: `ICD-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `ICD-Other ${runId}`, code: `ICD-O-${runId}` },
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

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Clinician',
        email: `icd-${runId}@example.com`,
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
        phone: `8${runId.slice(-9)}`,
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
    if (!dbAvailable) {
      return;
    }
    await prisma.$disconnect();
  });

  describe('catalogue search', () => {
    itDb('finds code by partial code query', async () => {
      const result = await icd10Service.search({ q: 'J06' });
      expect(result.data.some((r) => r.code === 'J06.9')).toBe(true);
    });

    itDb('finds code by description query', async () => {
      const result = await icd10Service.search({ q: 'Headache' });
      expect(result.data.some((r) => r.code === 'R51')).toBe(true);
    });

    itDb('paginates results', async () => {
      const page1 = await icd10Service.search({ q: 'e', page: 1, limit: 2 });
      expect(page1.data.length).toBeLessThanOrEqual(2);
      expect(page1.meta.page).toBe(1);
      expect(page1.meta.limit).toBe(2);
    });

    itDb('returns empty for non-matching query', async () => {
      const result = await icd10Service.search({ q: 'ZZZZNOTFOUND' });
      expect(result.data).toHaveLength(0);
    });

    itDb('findByCode returns inactive entry with isActive false', async () => {
      const inactive = ICD10_DEVELOPMENT_FIXTURE.find((c) => c.isActive === false);
      expect(inactive).toBeDefined();
      const row = await icd10Service.findByCode(inactive!.code);
      expect(row?.isActive).toBe(false);
    });
  });

  describe('diagnosis create', () => {
    itDb('uses catalogue description and ignores client override', async () => {
      const created = await clinicalService.createDiagnosis(
        hospitalWideUser(),
        encounterId,
        {
          code: 'R51',
          description: 'Client override text',
          diagnosisType: 'PRIMARY',
        },
      );
      const catalogue = ICD10_DEVELOPMENT_FIXTURE.find((c) => c.code === 'R51');
      expect(created.description).toBe(catalogue!.description);
      expect(created.description).not.toContain('Client override');
    });

    itDb('rejects nonexistent catalogue code', async () => {
      await expect(
        clinicalService.createDiagnosis(hospitalWideUser(), encounterId, {
          code: 'B99.9',
          description: 'Ignored',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    itDb('rejects inactive catalogue code', async () => {
      await expect(
        clinicalService.createDiagnosis(hospitalWideUser(), encounterId, {
          code: 'Z99.9',
          description: 'Ignored',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    itDb('rejects malformed ICD code', async () => {
      await expect(
        clinicalService.createDiagnosis(hospitalWideUser(), encounterId, {
          code: 'INVALID',
          description: 'Bad',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('diagnosis update', () => {
    itDb('ignores client description when code unchanged', async () => {
      const dx = await clinicalService.createDiagnosis(
        hospitalWideUser(),
        encounterId,
        { code: 'R50.9' },
      );

      const updated = await clinicalService.updateDiagnosis(
        hospitalWideUser(),
        dx.id,
        { description: 'Should not apply' },
      );
      expect(updated.description).toBe(dx.description);
    });

    itDb('changes description when code changes to active entry', async () => {
      const dx = await clinicalService.createDiagnosis(
        hospitalWideUser(),
        encounterId,
        { code: 'R50.9' },
      );

      const updated = await clinicalService.updateDiagnosis(
        hospitalWideUser(),
        dx.id,
        { code: 'J06.9' },
      );
      const expected = ICD10_DEVELOPMENT_FIXTURE.find((c) => c.code === 'J06.9');
      expect(updated.code).toBe('J06.9');
      expect(updated.description).toBe(expected!.description);
    });

    itDb('rejects update to inactive code', async () => {
      const dx = await clinicalService.createDiagnosis(
        hospitalWideUser(),
        encounterId,
        { code: 'R50.9' },
      );

      await expect(
        clinicalService.updateDiagnosis(hospitalWideUser(), dx.id, {
          code: 'Z99.9',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    itDb('historical diagnosis remains readable after code deactivation', async () => {
      const tempCode = `R52`;
      await prisma.icd10Code.upsert({
        where: { code: tempCode },
        create: {
          code: tempCode,
          description: 'Pain, not elsewhere classified',
          isActive: true,
        },
        update: { isActive: true },
      });

      const dx = await clinicalService.createDiagnosis(
        hospitalWideUser(),
        encounterId,
        { code: tempCode },
      );

      await prisma.icd10Code.update({
        where: { code: tempCode },
        data: { isActive: false },
      });

      const listed = await clinicalService.listDiagnoses(
        hospitalWideUser(),
        encounterId,
      );
      const row = listed.find((d) => d.id === dx.id);
      expect(row?.code).toBe(tempCode);
      expect(row?.description).toContain('Pain');
    });
  });

  describe('branch scope', () => {
    itDb('denies branch user on another branch encounter', async () => {
      const otherEncounter = await prisma.clinicalEncounter.create({
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
        clinicalService.createDiagnosis(branchUser(branchId), otherEncounter.id, {
          code: 'R51',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    itDb('catalogue is global and not hospital scoped', async () => {
      const fromOther = await icd10Service.search({ q: 'J06' });
      expect(fromOther.data.length).toBeGreaterThan(0);
      expect(otherHospitalId).not.toBe(hospitalId);
    });
  });
});
