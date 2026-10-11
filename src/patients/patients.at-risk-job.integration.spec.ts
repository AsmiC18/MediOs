import {
  AppointmentStatus,
  JobStatus,
  PatientAtRiskStatus,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PatientAtRiskEvaluateHandler } from '../jobs/handlers/patient-at-risk-evaluate.handler';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { PatientNotificationPreferenceService } from '../notifications/patient-notification-preference.service';
import { PatientsService } from './patients.service';

describe('Patient at-risk job (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let patientId: string;
  let handler: PatientAtRiskEvaluateHandler;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    const auditService = new AuditService(prisma as never);
    const patientsService = new PatientsService(
      prisma as never,
      auditService,
      new PatientNotificationPreferenceService(prisma as never),
      {
        syncFromAtRiskEvaluation: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    handler = new PatientAtRiskEvaluateHandler(patientsService);

    const hospital = await prisma.hospital.create({
      data: { name: 'AtRisk Job', code: `ARJ-${runId}` },
    });
    hospitalId = hospital.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        phone: `8${runId.slice(0, 9)}0`,
        firstName: 'JobPatient',
      },
    });
    patientId = patient.id;

    const now = Date.now();
    const visit1Start = new Date(now - 60 * 86400000);
    const visit2Start = new Date(now - 30 * 86400000);

    await prisma.appointment.createMany({
      data: [
        {
          hospitalId,
          patientId,
          startAt: visit1Start,
          endAt: new Date(visit1Start.getTime() + 30 * 60 * 1000),
          status: AppointmentStatus.COMPLETED,
        },
        {
          hospitalId,
          patientId,
          startAt: visit2Start,
          endAt: new Date(visit2Start.getTime() + 30 * 60 * 1000),
          status: AppointmentStatus.COMPLETED,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.job.deleteMany({ where: { hospitalId } });
    await prisma.appointment.deleteMany({ where: { hospitalId } });
    await prisma.patient.deleteMany({ where: { hospitalId } });
    await prisma.hospital.delete({ where: { id: hospitalId } });
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

  itWithDb('handler persists patient at-risk fields from completed visits', async () => {
    const job = await prisma.job.create({
      data: {
        hospitalId,
        branchId: null,
        type: JOB_TYPES.PATIENT_AT_RISK_EVALUATE,
        idempotencyKey: `${JOB_TYPES.PATIENT_AT_RISK_EVALUATE}:${hospitalId}:integration-${runId}`,
        payload: { window: '2026-04-01' },
        maxAttempts: 3,
        status: JobStatus.PENDING,
      },
    });

    const result = await handler.handle(job, { workerId: 'worker-int' });

    expect(result.evaluatedCount).toBe(1);

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    expect(patient!.atRiskEvaluatedAt).not.toBeNull();
    expect(patient!.atRiskStatus).toBe(PatientAtRiskStatus.NOT_AT_RISK);
    expect(patient!.averageVisitCadenceDays).toBe(30);
    expect(patient!.daysSinceLastVisit).not.toBeNull();
    expect(patient!.suggestedAction).toContain('Continue routine follow-up');
  });
});
