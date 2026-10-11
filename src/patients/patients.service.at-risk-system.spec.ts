import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  PatientAtRiskStatus,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PatientsService } from './patients.service';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';

describe('PatientsService at-risk system job', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalAId: string;
  let hospitalBId: string;
  let activePatientId: string;
  let mergedPatientId: string;
  let targetPatientId: string;

  let service: PatientsService;
  let auditLogs: Array<{ userId: string | null; metadata: unknown }>;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    auditLogs = [];
    const auditService = {
      log: jest.fn(async (entry) => {
        auditLogs.push({ userId: entry.userId, metadata: entry.metadata });
      }),
    } as unknown as AuditService;

    service = new PatientsService(
      prisma as never,
      auditService,
      new PatientNotificationPreferenceService(prisma as never),
      {
        syncFromAtRiskEvaluation: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    const hospitalA = await prisma.hospital.create({
      data: { name: 'AtRisk A', code: `AR-A-${runId}` },
    });
    hospitalAId = hospitalA.id;

    const hospitalB = await prisma.hospital.create({
      data: { name: 'AtRisk B', code: `AR-B-${runId}` },
    });
    hospitalBId = hospitalB.id;

    const active = await prisma.patient.create({
      data: {
        hospitalId: hospitalAId,
        phone: `9${runId.slice(0, 9)}1`,
        firstName: 'Active',
      },
    });
    activePatientId = active.id;

    const target = await prisma.patient.create({
      data: {
        hospitalId: hospitalAId,
        phone: `9${runId.slice(0, 9)}2`,
        firstName: 'MergeTarget',
      },
    });
    targetPatientId = target.id;

    const merged = await prisma.patient.create({
      data: {
        hospitalId: hospitalAId,
        phone: `9${runId.slice(0, 9)}3`,
        firstName: 'Merged',
        mergedIntoPatientId: targetPatientId,
        mergedAt: new Date(),
      },
    });
    mergedPatientId = merged.id;

    const now = Date.now();
    const v1 = new Date(now - 65 * 86400000);
    const v2 = new Date(now - 35 * 86400000);
    const v3 = new Date(now - 5 * 86400000);

    await prisma.appointment.createMany({
      data: [
        {
          hospitalId: hospitalAId,
          patientId: activePatientId,
          startAt: v1,
          endAt: new Date(v1.getTime() + 30 * 60 * 1000),
          status: AppointmentStatus.COMPLETED,
        },
        {
          hospitalId: hospitalAId,
          patientId: activePatientId,
          startAt: v2,
          endAt: new Date(v2.getTime() + 30 * 60 * 1000),
          status: AppointmentStatus.COMPLETED,
        },
        {
          hospitalId: hospitalAId,
          patientId: activePatientId,
          startAt: v3,
          endAt: new Date(v3.getTime() + 30 * 60 * 1000),
          status: AppointmentStatus.COMPLETED,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.appointment.deleteMany({
      where: { hospitalId: { in: [hospitalAId, hospitalBId] } },
    });
    await prisma.patient.deleteMany({
      where: { hospitalId: { in: [hospitalAId, hospitalBId] } },
    });
    await prisma.hospital.deleteMany({
      where: { id: { in: [hospitalAId, hospitalBId] } },
    });
    await prisma.$disconnect();
  });

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  itWithDb('evaluateAtRiskForSystemJob persists metrics and system audit', async () => {
    auditLogs.length = 0;
    const evaluatedAtBefore = new Date();

    const updated = await service.evaluateAtRiskForSystemJob(
      {
        jobId: 'job-1',
        jobType: 'patient.at_risk.evaluate',
        workerId: 'worker-1',
        hospitalId: hospitalAId,
      },
      activePatientId,
    );

    expect(updated.isAtRisk).toBe(false);
    expect(updated.atRiskStatus).toBe(PatientAtRiskStatus.NOT_AT_RISK);
    expect(updated.daysSinceLastVisit).toBe(5);
    expect(updated.averageVisitCadenceDays).toBe(30);
    expect(updated.atRiskEvaluatedAt!.getTime()).toBeGreaterThanOrEqual(
      evaluatedAtBefore.getTime(),
    );
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].userId).toBeNull();
    expect(auditLogs[0].metadata).toEqual(
      expect.objectContaining({
        source: 'background_job',
        jobId: 'job-1',
        workerId: 'worker-1',
      }),
    );
  });

  itWithDb('rejects cross-hospital patient evaluation', async () => {
    const other = await prisma.patient.create({
      data: {
        hospitalId: hospitalBId,
        phone: `9${runId.slice(0, 9)}9`,
        firstName: 'OtherHospital',
      },
    });

    try {
      await expect(
        service.evaluateAtRiskForSystemJob(
          {
            jobId: 'job-x',
            jobType: 'patient.at_risk.evaluate',
            workerId: 'worker-x',
            hospitalId: hospitalAId,
          },
          other.id,
        ),
      ).rejects.toThrow(NotFoundException);
    } finally {
      await prisma.patient.delete({ where: { id: other.id } });
    }
  });

  itWithDb('rejects merged patients for direct system evaluation', async () => {
    await expect(
      service.evaluateAtRiskForSystemJob(
        {
          jobId: 'job-m',
          jobType: 'patient.at_risk.evaluate',
          workerId: 'worker-m',
          hospitalId: hospitalAId,
        },
        mergedPatientId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  itWithDb('hospital batch skips merged patients and scopes to hospital', async () => {
    auditLogs.length = 0;

    const result = await service.evaluateHospitalPatientsAtRiskForSystemJob({
      jobId: 'job-batch',
      jobType: 'patient.at_risk.evaluate',
      workerId: 'worker-batch',
      hospitalId: hospitalAId,
    });

    expect(result.evaluatedCount).toBe(2);
    expect(result.atRiskCount).toBe(0);

    const merged = await prisma.patient.findUnique({
      where: { id: mergedPatientId },
    });
    expect(merged!.atRiskEvaluatedAt).toBeNull();

    const hospitalBPatient = await prisma.patient.findFirst({
      where: { hospitalId: hospitalBId },
    });
    if (hospitalBPatient) {
      expect(hospitalBPatient.atRiskEvaluatedAt).toBeNull();
    }
  });
});

describe('PatientsService read paths do not evaluate at-risk', () => {
  it('findOne and findAll do not invoke evaluateAtRisk', () => {
    const prototype = PatientsService.prototype;
    const findOneSource = prototype.findOne.toString();
    const findAllSource = prototype.findAll.toString();

    expect(findOneSource).not.toContain('evaluateAtRisk');
    expect(findAllSource).not.toContain('evaluateAtRisk');
  });
});
