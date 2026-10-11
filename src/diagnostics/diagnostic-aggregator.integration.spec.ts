import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  DiagnosticAggregatorSubmissionStatus,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { ManualDiagnosticLabAggregatorAdapter } from './adapters/manual-diagnostic-lab-aggregator.adapter';
import { DiagnosticAggregatorService } from './diagnostic-aggregator.service';
import { DiagnosticAggregatorSubmitJobHandler } from './diagnostic-aggregator-submit.job-handler';
import { DiagnosticsService } from './diagnostics.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';

describe('Diagnostic aggregator (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;
  let diagnosticsService: DiagnosticsService;
  let aggregatorService: DiagnosticAggregatorService;
  let submitHandler: DiagnosticAggregatorSubmitJobHandler;

  const user = () => ({
    sub: userId,
    hospitalId,
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

    const outboxService = new DomainEventOutboxService(
      prisma as never,
      new JobService(prisma as never),
    );
    diagnosticsService = new DiagnosticsService(
      prisma as never,
      new AuditService(prisma as never),
      outboxService,
      { enqueueInTransaction: jest.fn(), enqueueAfterCommit: jest.fn() } as never,
    );

    const adapter = new ManualDiagnosticLabAggregatorAdapter();
    aggregatorService = new DiagnosticAggregatorService(
      prisma as never,
      new JobService(prisma as never),
      new AuditService(prisma as never),
      adapter,
    );
    submitHandler = new DiagnosticAggregatorSubmitJobHandler(aggregatorService);

    const hospital = await prisma.hospital.create({
      data: { name: `Agg ${runId}`, code: `AG-${runId}` },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Lab', code: `AGB-${runId}` },
    });
    branchId = branch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Role-${runId}` },
    });

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Tech',
        email: `agg-${runId}@example.com`,
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
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  it('sets MANUAL_REQUIRED via job without changing order to completed', async () => {
    if (!dbAvailable) {
      return;
    }

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

    const order = await diagnosticsService.createOrder(user(), {
      encounterId: encounter.id,
      tests: [
        { testCode: 'TSH', testName: 'TSH', specimenType: 'Blood' },
      ],
    });

    await diagnosticsService.collectSample(user(), order.id);

    await aggregatorService.requestAggregatorSubmission(user(), order.id);

    const job = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId,
        type: JOB_TYPES.DIAGNOSTIC_AGGREGATOR_SUBMIT,
        idempotencyKey: `${JOB_TYPES.DIAGNOSTIC_AGGREGATOR_SUBMIT}:${order.id}`,
      },
    });

    await submitHandler.handle(job, { workerId: 'w1' });
    await submitHandler.handle(job, { workerId: 'w1' });

    const row = await prisma.diagnosticOrder.findUniqueOrThrow({
      where: { id: order.id },
    });

    expect(row.aggregatorSubmissionStatus).toBe(
      DiagnosticAggregatorSubmissionStatus.MANUAL_REQUIRED,
    );
    expect(row.status).not.toBe('COMPLETED');
  });
});
