import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  ClinicalSafetyPolicyAction,
  InteractionAdapterStatus,
  PrescriptionSafetyFindingType,
  PrescriptionSafetySeverity,
  PrismaClient,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { buildFindingKey } from './safety/finding-key.util';
import { AuditService } from '../audit/audit.service';
import { UnavailableDrugInteractionAdapter } from './adapters/unavailable-drug-interaction.adapter';
import { ClinicalService } from './clinical.service';
import { Icd10Service } from './icd10/icd10.service';
import { ClinicalDrugService } from './drugs/clinical-drug.service';
import { ClinicalSafetyPolicyService } from './safety/clinical-safety-policy.service';
import { PrescriptionSafetyService } from './safety/prescription-safety.service';
import { JobService } from '../jobs/job.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { ClinicalPrescriptionOutboxService } from './events/clinical-prescription-outbox.service';
describe('Prescription safety (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let roleId: string;
  let userId: string;
  let patientId: string;
  let encounterId: string;
  let clinicalService: ClinicalService;
  let clinicalDrugService: ClinicalDrugService;
  let policyService: ClinicalSafetyPolicyService;

  const user = (overrideRoleId?: string) => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
    roleId: overrideRoleId ?? roleId,
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
    clinicalDrugService = new ClinicalDrugService(prisma as never);
    policyService = new ClinicalSafetyPolicyService(prisma as never);
    const interactionAdapter = new UnavailableDrugInteractionAdapter();
    const prescriptionSafetyService = new PrescriptionSafetyService(
      prisma as never,
      clinicalDrugService,
      policyService,
      interactionAdapter,
    );
    const jobService = new JobService(prisma as never);
    const domainEventOutboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    const clinicalPrescriptionOutboxService = new ClinicalPrescriptionOutboxService(
      domainEventOutboxService,
    );
    clinicalService = new ClinicalService(
      prisma as never,
      auditService,
      prescriptionSafetyService,
      clinicalPrescriptionOutboxService,
      new Icd10Service(prisma as never),
    );

    const hospital = await prisma.hospital.create({
      data: { name: `Clin ${runId}`, code: `CL-${runId}` },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Role-${runId}` },
    });
    roleId = role.id;

    for (const name of ['clinical:manage', 'clinical:safety_override']) {
      const permission = await prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name, description: name },
      });
      await prisma.rolePermission.create({
        data: { roleId, permissionId: permission.id },
      });
    }

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId,
        name: 'Clinician',
        email: `clin-${runId}@example.com`,
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
        allergies: ['Penicillin'],
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

  it('creates free-text prescription with safety evaluation persisted', async () => {
    if (!dbAvailable) {
      return;
    }

    const result = await clinicalService.createPrescription(user(), encounterId, {
      items: [{ medicationName: 'Vitamin D', quantity: 1 }],
    });

    expect(result.id).toBeDefined();
    expect(result.interactionCheckAvailable).toBe(false);

    const evaluation = await prisma.prescriptionSafetyEvaluation.findUnique({
      where: { prescriptionId: result.id },
      include: { findings: true },
    });
    expect(evaluation).not.toBeNull();
    expect(evaluation?.interactionAdapterStatus).toBe(
      InteractionAdapterStatus.UNAVAILABLE,
    );

    const audit = await prisma.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'CLINICAL_PRESCRIPTION_SAFETY_EVALUATED',
        entityId: evaluation?.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('blocks structured allergy match when hospital policy is BLOCK', async () => {
    if (!dbAvailable) {
      return;
    }

    await policyService.upsertPolicyForHospital(hospitalId, {
      allergyIngredientMatch: ClinicalSafetyPolicyAction.BLOCK,
    });

    const drug = await clinicalDrugService.createDrug(hospitalId, {
      genericName: 'Amoxicillin',
      ingredients: ['Penicillin'],
    });

    const rxBefore = await prisma.prescription.count({ where: { hospitalId } });
    const evalBefore = await prisma.prescriptionSafetyEvaluation.count({
      where: { hospitalId },
    });

    await expect(
      clinicalService.createPrescription(user(), encounterId, {
        items: [
          {
            medicationName: 'Amoxicillin 500mg',
            clinicalDrugId: drug.id,
            quantity: 10,
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'PRESCRIPTION_SAFETY_BLOCKED' } });

    const rxAfter = await prisma.prescription.count({ where: { hospitalId } });
    const evalAfter = await prisma.prescriptionSafetyEvaluation.count({
      where: { hospitalId },
    });
    expect(rxAfter).toBe(rxBefore);
    expect(evalAfter).toBe(evalBefore);
  });

  it('allows override with permission and persists override audit', async () => {
    if (!dbAvailable) {
      return;
    }

    const drug = await clinicalDrugService.createDrug(hospitalId, {
      genericName: 'Amoxicillin-B',
      ingredients: ['Penicillin'],
    });

    await expect(
      clinicalService.createPrescription(user(), encounterId, {
        items: [
          {
            medicationName: 'Amoxicillin-B 500mg',
            clinicalDrugId: drug.id,
            quantity: 10,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const findingKey = buildFindingKey(
      PrescriptionSafetyFindingType.ALLERGY,
      'EXACT_STRUCTURED',
      'Amoxicillin-B 500mg',
      'Penicillin',
      'Penicillin',
    );

    const created = await clinicalService.createPrescription(user(), encounterId, {
      items: [
        {
          medicationName: 'Amoxicillin-B 500mg',
          clinicalDrugId: drug.id,
          quantity: 10,
        },
      ],
      safetyOverrides: {
        findingKeys: [findingKey!],
        reason: 'Benefit outweighs documented allergy after review',
      },
    });

    expect(created.safetyFindings?.some((f) => f.overridden)).toBe(true);

    const overrideAudit = await prisma.auditLog.findFirst({
      where: {
        hospitalId,
        action: 'CLINICAL_PRESCRIPTION_SAFETY_OVERRIDE',
        entityId: created.id,
      },
    });
    expect(overrideAudit).not.toBeNull();
  });

  it('rejects wrong-hospital clinical drug', async () => {
    if (!dbAvailable) {
      return;
    }

    const otherHospital = await prisma.hospital.create({
      data: { name: `Other ${runId}`, code: `OT-${runId}` },
    });

    const otherDrug = await clinicalDrugService.createDrug(otherHospital.id, {
      genericName: 'Other Drug',
    });

    await expect(
      clinicalService.createPrescription(user(), encounterId, {
        items: [
          {
            medicationName: 'Other Drug',
            clinicalDrugId: otherDrug.id,
          },
        ],
      }),
    ).rejects.toThrow('Clinical drug not found');
  });

  it('reports structural duplicate clinicalDrugId lines as INFO findings', async () => {
    if (!dbAvailable) {
      return;
    }

    await policyService.upsertPolicyForHospital(hospitalId, {
      allergyIngredientMatch: ClinicalSafetyPolicyAction.WARN,
    });

    const drug = await clinicalDrugService.createDrug(hospitalId, {
      genericName: 'Paracetamol',
    });

    const created = await clinicalService.createPrescription(user(), encounterId, {
      items: [
        { medicationName: 'Paracetamol 500', clinicalDrugId: drug.id, quantity: 10 },
        { medicationName: 'Paracetamol 500 duplicate', clinicalDrugId: drug.id, quantity: 5 },
      ],
    });

    const dup = created.safetyFindings?.find((f) => f.findingType === 'DUPLICATE_THERAPY');
    expect(dup?.severity).toBe(PrescriptionSafetySeverity.INFO);
  });
});
