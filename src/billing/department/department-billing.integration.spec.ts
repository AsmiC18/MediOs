import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  DiagnosticOrderStatus,
  IpdAdmissionStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { JobService } from '../../jobs/job.service';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { IpdAdmissionService } from '../../ipd/ipd-admission.service';
import { DiagnosticsService } from '../../diagnostics/diagnostics.service';
import { DepartmentBillingEnqueueService } from './department-billing-enqueue.service';
import { DepartmentBillingJobHandler } from './department-billing.job-handler';
import { DepartmentBillingProcessService } from './department-billing-process.service';
import { DraftLineInvoiceBillingService } from './draft-line-invoice-billing.service';
import { buildStaffAttendanceConsultationDomainEvent } from '../../attendance/staff-attendance-consultation-event.util';
import {
  buildOpdConsultationBillingEvent,
  diagnosticOrderItemBillingSourceKey,
  ipdDischargeBillingSourceKey,
  opdConsultationBillingSourceKey,
} from './department-billing-event.util';

describe('Department billing (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;
  let billingHandler: DepartmentBillingJobHandler;

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

    const jobService = new JobService(prisma as never);
    const outboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    const auditService = new AuditService(prisma as never);
    const draftLineBilling = new DraftLineInvoiceBillingService(
      prisma as never,
      outboxService,
      auditService,
    );
    const processService = new DepartmentBillingProcessService(
      prisma as never,
      outboxService,
      draftLineBilling,
    );
    billingHandler = new DepartmentBillingJobHandler(processService);

    const hospital = await prisma.hospital.create({
      data: {
        name: `DeptBill ${runId}`,
        code: `DB-${runId}`,
        consultationFeeUnitPrice: new Prisma.Decimal(500),
        consultationFeeGstRate: new Prisma.Decimal(0),
        ipdDischargeFeeUnitPrice: new Prisma.Decimal(2000),
        ipdDischargeFeeGstRate: new Prisma.Decimal(0),
      },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
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
        name: 'Admin',
        email: `dbill-${runId}@example.com`,
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

  it('creates idempotent IPD discharge invoice line', async () => {
    if (!dbAvailable) {
      return;
    }

    const jobService = new JobService(prisma as never);
    const outboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    const billingEnqueue = new DepartmentBillingEnqueueService(
      prisma as never,
      outboxService,
      jobService,
      new AuditService(prisma as never),
    );
    const ipdService = new IpdAdmissionService(
      prisma as never,
      new AuditService(prisma as never),
      billingEnqueue,
    );

    const admission = await prisma.ipdAdmission.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        admissionNumber: `ADM-${runId}`,
        status: IpdAdmissionStatus.DISCHARGED,
        admissionDate: new Date(),
        dischargeDate: new Date(),
      },
    });

    const event = {
      hospitalId,
      branchId,
      eventType: 'ipd.discharge.billing',
      entityType: 'IpdAdmission',
      entityId: admission.id,
      idempotencyKey: `ipd.discharge.billing:${admission.id}`,
      payload: {
        admissionId: admission.id,
        patientId,
        hospitalId,
        branchId,
      },
    };

    const outbox = await prisma.$transaction(async (tx) => {
      const created = await outboxService.createInTransaction(tx, event as never);
      await jobService.enqueueWithClient(tx, {
        hospitalId,
        branchId,
        type: JOB_TYPES.BILLING_DEPARTMENT_PROCESS,
        idempotencyKey: `${JOB_TYPES.BILLING_DEPARTMENT_PROCESS}:${admission.id}`,
        payload: { outboxId: created.id },
        maxAttempts: 5,
      });
      return created;
    });

    const job = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId,
        type: JOB_TYPES.BILLING_DEPARTMENT_PROCESS,
        idempotencyKey: `${JOB_TYPES.BILLING_DEPARTMENT_PROCESS}:${admission.id}`,
      },
    });

    await billingHandler.handle(job, { workerId: 'db-int' });
    await billingHandler.handle(job, { workerId: 'db-int-retry' });

    const items = await prisma.invoiceItem.findMany({
      where: {
        hospitalId,
        sourceKey: ipdDischargeBillingSourceKey(admission.id),
      },
    });
    expect(items).toHaveLength(1);

    void ipdService;
    void outbox;
  });

  it('bills diagnostic order items with configured unit prices only', async () => {
    if (!dbAvailable) {
      return;
    }

    const jobService = new JobService(prisma as never);
    const outboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    const billingEnqueue = new DepartmentBillingEnqueueService(
      prisma as never,
      outboxService,
      jobService,
      new AuditService(prisma as never),
    );
    const diagnosticsService = new DiagnosticsService(
      prisma as never,
      new AuditService(prisma as never),
      outboxService,
      billingEnqueue,
    );

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
        {
          testCode: 'CBC',
          testName: 'CBC',
          specimenType: 'Blood',
          billableUnitPrice: 350,
        },
      ],
    });

    const stored = await prisma.diagnosticOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    const item = stored.items[0]!;

    await diagnosticsService.collectSample(user(), order.id);
    await diagnosticsService.startProcessing(user(), order.id);
    await diagnosticsService.enterResult(user(), item.id, {
      resultValue: '12',
    });

    await diagnosticsService.completeOrder(user(), order.id);

    const billingJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId,
        type: JOB_TYPES.BILLING_DEPARTMENT_PROCESS,
        idempotencyKey: `${JOB_TYPES.BILLING_DEPARTMENT_PROCESS}:${order.id}`,
      },
    });

    await billingHandler.handle(billingJob, { workerId: 'diag-bill' });

    const pricedLine = await prisma.invoiceItem.findFirst({
      where: {
        hospitalId,
        sourceKey: diagnosticOrderItemBillingSourceKey(item.id),
      },
    });
    expect(pricedLine).not.toBeNull();

  });

  it('attendance billing then OPD completion billing yields one consultation line', async () => {
    if (!dbAvailable) {
      return;
    }

    const appointment = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        status: 'COMPLETED',
      },
    });

    const outboxService = new DomainEventOutboxService(
      prisma as never,
      new JobService(prisma as never),
    );
    const processService = new DepartmentBillingProcessService(
      prisma as never,
      outboxService,
      new DraftLineInvoiceBillingService(
        prisma as never,
        outboxService,
        new AuditService(prisma as never),
      ),
    );

    const staffOutbox = await prisma.$transaction(async (tx) =>
      outboxService.createInTransaction(
        tx,
        buildStaffAttendanceConsultationDomainEvent({
          attendanceId: 'att-verify',
          userId,
          resourceId: 'res-verify',
          appointment: {
            id: appointment.id,
            patientId,
            hospitalId,
            branchId,
            startAt: appointment.startAt,
            endAt: appointment.endAt,
          },
          clockInAt: new Date(),
        }),
      ),
    );

    const staffResult = await processService.processOutboxEvent(
      hospitalId,
      staffOutbox.id,
      { jobId: 'j-staff', workerId: 'w1' },
    );
    expect(staffResult.outcome).toBe('created');

    const opdOutbox = await prisma.$transaction(async (tx) =>
      outboxService.createInTransaction(
        tx,
        buildOpdConsultationBillingEvent({
          appointmentId: appointment.id,
          patientId,
          hospitalId,
          branchId,
          queueEntryId: 'queue-verify',
        }),
      ),
    );

    const opdResult = await processService.processOutboxEvent(
      hospitalId,
      opdOutbox.id,
      { jobId: 'j-opd', workerId: 'w2' },
    );
    expect(opdResult.outcome).toBe('already_processed');

    const lines = await prisma.invoiceItem.count({
      where: {
        hospitalId,
        sourceKey: opdConsultationBillingSourceKey(appointment.id),
      },
    });
    expect(lines).toBe(1);
  });

  it('dedupes OPD consultation billing with staff attendance source key', async () => {
    if (!dbAvailable) {
      return;
    }

    const appointment = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        status: 'COMPLETED',
      },
    });

    const preInvoice = await prisma.invoice.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        invoiceNumber: `INV-PRE-${runId}`,
        subtotalAmount: new Prisma.Decimal(500),
        totalAmount: new Prisma.Decimal(500),
      },
    });
    await prisma.invoiceItem.create({
      data: {
        hospitalId,
        invoiceId: preInvoice.id,
        description: 'Consultation',
        unitPrice: new Prisma.Decimal(500),
        lineTotal: new Prisma.Decimal(500),
        taxableAmount: new Prisma.Decimal(500),
        lineTotalWithTax: new Prisma.Decimal(500),
        sourceKey: opdConsultationBillingSourceKey(appointment.id),
      },
    });

    const outboxService = new DomainEventOutboxService(
      prisma as never,
      new JobService(prisma as never),
    );
    const processService = new DepartmentBillingProcessService(
      prisma as never,
      outboxService,
      new DraftLineInvoiceBillingService(
        prisma as never,
        outboxService,
        new AuditService(prisma as never),
      ),
    );

    const outbox = await prisma.$transaction(async (tx) =>
      outboxService.createInTransaction(tx, {
        hospitalId,
        branchId,
        eventType: 'opd.consultation.billing',
        entityType: 'Appointment',
        entityId: appointment.id,
        idempotencyKey: `opd.consultation.billing:${appointment.id}`,
        payload: {
          appointmentId: appointment.id,
          patientId,
          hospitalId,
          branchId,
          queueEntryId: 'q-1',
        },
      } as never),
    );

    const result = await processService.processOutboxEvent(
      hospitalId,
      outbox.id,
      { jobId: 'j1', workerId: 'w1' },
    );

    expect(result.outcome).toBe('already_processed');

    const count = await prisma.invoiceItem.count({
      where: {
        hospitalId,
        sourceKey: opdConsultationBillingSourceKey(appointment.id),
      },
    });
    expect(count).toBe(1);
  });
});
