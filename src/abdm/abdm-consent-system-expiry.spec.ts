import { AbdmConsentStatus, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { AbdmConsentExpireHandler } from '../jobs/handlers/abdm-consent-expire.handler';
import { JobHandlerRegistry } from '../jobs/job-handler.registry';
import { JobWorkerService } from '../jobs/job-worker.service';
import { JobService } from '../jobs/job.service';
import { AbdmConsentAuditService } from './abdm-consent-audit.service';
import { AbdmConsentManagerService } from './abdm-consent-manager.service';
import { AbdmConsentService } from './abdm-consent.service';
import { AbdmEnvironmentService } from './abdm-environment.service';

describe('AbdmConsent system expiry (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  let hospitalAId: string;
  let hospitalBId: string;
  let branchAId: string;
  let userAId: string;
  let patientAId: string;
  let patientBId: string;
  let consentExpiredAId: string;
  let consentActiveAId: string;
  let consentExpiredBId: string;
  let consentRevokedAId: string;
  let consentAlreadyExpiredAId: string;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let consentService: AbdmConsentService;
  let jobService: JobService;

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
    const consentAuditService = new AbdmConsentAuditService(prisma as never);
    const environmentService = new AbdmEnvironmentService();
    const consentManagerService = new AbdmConsentManagerService(
      environmentService,
    );
    consentService = new AbdmConsentService(
      prisma as never,
      auditService,
      consentAuditService,
      consentManagerService,
      environmentService,
    );
    jobService = new JobService(prisma as never);

    const hospitalA = await prisma.hospital.create({
      data: {
        name: 'Consent Expiry A',
        code: `CE-A-${runId}`,
        branches: { create: { name: 'Branch A', code: 'MAIN' } },
      },
      include: { branches: true },
    });
    hospitalAId = hospitalA.id;
    branchAId = hospitalA.branches[0].id;

    const hospitalB = await prisma.hospital.create({
      data: { name: 'Consent Expiry B', code: `CE-B-${runId}` },
    });
    hospitalBId = hospitalB.id;

    const user = await prisma.user.create({
      data: {
        hospitalId: hospitalAId,
        branchId: branchAId,
        name: 'Consent Test User',
        email: `consent-expiry-${runId}@example.com`,
        passwordHash: 'hash',
        roleId: (
          await prisma.role.create({
            data: {
              hospitalId: hospitalAId,
              name: `Role-${runId}`,
            },
          })
        ).id,
      },
    });
    userAId = user.id;

    const patientA = await prisma.patient.create({
      data: {
        hospitalId: hospitalAId,
        branchId: branchAId,
        firstName: 'Patient',
        lastName: 'A',
        phone: `9000${runId.slice(-6)}`,
      },
    });
    patientAId = patientA.id;

    const patientB = await prisma.patient.create({
      data: {
        hospitalId: hospitalBId,
        firstName: 'Patient',
        lastName: 'B',
        phone: `9001${runId.slice(-6)}`,
      },
    });
    patientBId = patientB.id;

    const past = new Date(Date.now() - 60 * 60 * 1000);
    const future = new Date(Date.now() + 60 * 60 * 1000);

    consentExpiredAId = (
      await prisma.abdmConsent.create({
        data: {
          hospitalId: hospitalAId,
          branchId: branchAId,
          patientId: patientAId,
          purpose: 'Care',
          hiTypes: ['Prescription'],
          status: AbdmConsentStatus.GRANTED,
          requestedByUserId: userAId,
          grantedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          expiresAt: past,
        },
      })
    ).id;

    consentActiveAId = (
      await prisma.abdmConsent.create({
        data: {
          hospitalId: hospitalAId,
          branchId: branchAId,
          patientId: patientAId,
          purpose: 'Care2',
          hiTypes: ['Prescription'],
          status: AbdmConsentStatus.GRANTED,
          requestedByUserId: userAId,
          grantedAt: new Date(),
          expiresAt: future,
        },
      })
    ).id;

    consentRevokedAId = (
      await prisma.abdmConsent.create({
        data: {
          hospitalId: hospitalAId,
          branchId: branchAId,
          patientId: patientAId,
          purpose: 'Care3',
          hiTypes: ['Prescription'],
          status: AbdmConsentStatus.REVOKED,
          requestedByUserId: userAId,
          grantedAt: past,
          expiresAt: past,
          revokedAt: past,
        },
      })
    ).id;

    consentAlreadyExpiredAId = (
      await prisma.abdmConsent.create({
        data: {
          hospitalId: hospitalAId,
          branchId: branchAId,
          patientId: patientAId,
          purpose: 'Care4',
          hiTypes: ['Prescription'],
          status: AbdmConsentStatus.EXPIRED,
          requestedByUserId: userAId,
          grantedAt: past,
          expiresAt: past,
        },
      })
    ).id;

    consentExpiredBId = (
      await prisma.abdmConsent.create({
        data: {
          hospitalId: hospitalBId,
          patientId: patientBId,
          purpose: 'Care',
          hiTypes: ['Prescription'],
          status: AbdmConsentStatus.GRANTED,
          requestedByUserId: userAId,
          grantedAt: past,
          expiresAt: past,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.job.deleteMany({
      where: { hospitalId: { in: [hospitalAId, hospitalBId] } },
    });
    await prisma.abdmConsentAuditLog.deleteMany({
      where: { hospitalId: { in: [hospitalAId, hospitalBId] } },
    });
    await prisma.abdmConsent.deleteMany({
      where: { hospitalId: { in: [hospitalAId, hospitalBId] } },
    });
    await prisma.patient.deleteMany({
      where: { hospitalId: { in: [hospitalAId, hospitalBId] } },
    });
    await prisma.user.deleteMany({ where: { hospitalId: hospitalAId } });
    await prisma.role.deleteMany({ where: { hospitalId: hospitalAId } });
    await prisma.branch.deleteMany({ where: { hospitalId: hospitalAId } });
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

  itWithDb('expires eligible GRANTED consents past expiresAt for the job hospital', async () => {
    const count = await consentService.expireExpiredConsentsForSystemJob({
      jobId: 'job-test-1',
      jobType: JOB_TYPES.ABDM_CONSENT_EXPIRE,
      workerId: 'worker-test',
      hospitalId: hospitalAId,
      branchId: null,
    });

    expect(count).toBeGreaterThanOrEqual(1);

    const expired = await prisma.abdmConsent.findUniqueOrThrow({
      where: { id: consentExpiredAId },
    });
    expect(expired.status).toBe(AbdmConsentStatus.EXPIRED);

    const active = await prisma.abdmConsent.findUniqueOrThrow({
      where: { id: consentActiveAId },
    });
    expect(active.status).toBe(AbdmConsentStatus.GRANTED);

    const revoked = await prisma.abdmConsent.findUniqueOrThrow({
      where: { id: consentRevokedAId },
    });
    expect(revoked.status).toBe(AbdmConsentStatus.REVOKED);

    const alreadyExpired = await prisma.abdmConsent.findUniqueOrThrow({
      where: { id: consentAlreadyExpiredAId },
    });
    expect(alreadyExpired.status).toBe(AbdmConsentStatus.EXPIRED);
  });

  itWithDb('does not expire consents belonging to another hospital', async () => {
    await consentService.expireExpiredConsentsForSystemJob({
      jobId: 'job-test-2',
      jobType: JOB_TYPES.ABDM_CONSENT_EXPIRE,
      workerId: 'worker-test',
      hospitalId: hospitalAId,
      branchId: null,
    });

    const hospitalBConsent = await prisma.abdmConsent.findUniqueOrThrow({
      where: { id: consentExpiredBId },
    });
    expect(hospitalBConsent.status).toBe(AbdmConsentStatus.GRANTED);
  });

  itWithDb('is idempotent when run again', async () => {
    const first = await consentService.expireExpiredConsentsForSystemJob({
      jobId: 'job-test-3a',
      jobType: JOB_TYPES.ABDM_CONSENT_EXPIRE,
      workerId: 'worker-test',
      hospitalId: hospitalAId,
    });
    const second = await consentService.expireExpiredConsentsForSystemJob({
      jobId: 'job-test-3b',
      jobType: JOB_TYPES.ABDM_CONSENT_EXPIRE,
      workerId: 'worker-test',
      hospitalId: hospitalAId,
    });
    expect(second).toBe(0);
    void first;
  });

  itWithDb('worker handler completes job after successful expiry', async () => {
    const past = new Date(Date.now() - 30 * 60 * 1000);
    const consent = await prisma.abdmConsent.create({
      data: {
        hospitalId: hospitalAId,
        branchId: branchAId,
        patientId: patientAId,
        purpose: 'WorkerFlow',
        hiTypes: ['Prescription'],
        status: AbdmConsentStatus.GRANTED,
        requestedByUserId: userAId,
        grantedAt: past,
        expiresAt: past,
      },
    });

    const job = await jobService.enqueue({
      hospitalId: hospitalAId,
      branchId: null,
      type: JOB_TYPES.ABDM_CONSENT_EXPIRE,
      idempotencyKey: `integration-worker-${runId}`,
      payload: { window: 'test' },
      maxAttempts: 3,
    });

    const registry = new JobHandlerRegistry();
    registry.register(JOB_TYPES.ABDM_CONSENT_EXPIRE, async (claimedJob, ctx) => {
      await new AbdmConsentExpireHandler(consentService).handle(claimedJob, ctx);
    });

    const worker = new JobWorkerService(jobService as never, registry);
    const running = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        lockedBy: worker.getWorkerId(),
        lockedAt: new Date(),
        attempts: 1,
        startedAt: new Date(),
      },
    });

    await worker.executeJob(running);

    const completed = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(completed.status).toBe('COMPLETED');

    const updatedConsent = await prisma.abdmConsent.findUniqueOrThrow({
      where: { id: consent.id },
    });
    expect(updatedConsent.status).toBe(AbdmConsentStatus.EXPIRED);
  });

  itWithDb('propagates unexpected database errors from handler', async () => {
    const brokenConsentService = new AbdmConsentService(
      {
        abdmConsent: {
          findMany: jest.fn().mockRejectedValue(new Error('db down')),
        },
      } as never,
      { log: jest.fn() } as never,
      { log: jest.fn() } as never,
      { createConsentRequest: jest.fn() } as never,
      { isMockMode: () => true } as never,
    );

    const handler = new AbdmConsentExpireHandler(brokenConsentService);
    const job = {
      id: 'job-fail',
      hospitalId: hospitalAId,
      branchId: null,
      type: JOB_TYPES.ABDM_CONSENT_EXPIRE,
    } as never;

    await expect(
      handler.handle(job, { workerId: 'worker-test' }),
    ).rejects.toThrow('db down');
  });
});
