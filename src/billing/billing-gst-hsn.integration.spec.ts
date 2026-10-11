import { BadRequestException } from '@nestjs/common';
import { GstSupplyType, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { JobService } from '../jobs/job.service';
import { createNoopReportProjectionBillingHook } from '../reports/report-projection.test-util';
import { BillingService } from './billing.service';
import { DraftLineInvoiceBillingService } from './department/draft-line-invoice-billing.service';

const VALID_GSTIN = '36AABCU9603R1Z5';

describe('Billing GST HSN/SAC hardening', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;

  let billingService: BillingService;
  let draftLineBilling: DraftLineInvoiceBillingService;

  const hospitalWideUser = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
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

    billingService = new BillingService(
      prisma as never,
      new AuditService(prisma as never),
      createNoopReportProjectionBillingHook(),
    );

    const jobService = new JobService(prisma as never);
    const outboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    draftLineBilling = new DraftLineInvoiceBillingService(
      prisma as never,
      outboxService,
      new AuditService(prisma as never),
    );

    const hospital = await prisma.hospital.create({
      data: {
        name: `GST-HSN ${runId}`,
        code: `GH-${runId}`,
        gstin: VALID_GSTIN,
        stateCode: '36',
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

    const user = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Bill',
        email: `gst-hsn-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = user.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Pat',
        lastName: runId,
        phone: `6${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  itDb('rejects manual invoice with taxed line and no HSN', async () => {
    await expect(
      billingService.create(hospitalWideUser(), {
        patientId,
        branchId,
        placeOfSupplyStateCode: '36',
        items: [
          {
            description: 'Taxed service',
            quantity: 1,
            unitPrice: 1000,
            gstRate: 18,
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  itDb('creates manual invoice with taxed line and valid HSN', async () => {
    const invoice = await billingService.create(hospitalWideUser(), {
      patientId,
      branchId,
      placeOfSupplyStateCode: '36',
      items: [
        {
          description: 'Taxed service',
          quantity: 1,
          unitPrice: 1000,
          gstRate: 18,
          hsnSac: '998311',
        },
      ],
    });

    expect(invoice.items[0].hsnSac).toBe('998311');
    expect(invoice.supplyType).toBe(GstSupplyType.INTRA_STATE);
    expect(invoice.cgstAmount.toNumber()).toBe(90);
  });

  itDb('allows automated zero-GST draft line without HSN', async () => {
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId,
        eventType: 'test.gst.hsn.zero',
        entityType: 'Test',
        entityId: `zero-${runId}`,
        payload: {},
        status: 'PENDING',
        idempotencyKey: `test.gst.hsn.zero.${runId}`,
      },
    });

    const result = await draftLineBilling.createDraftInvoiceWithLines({
      hospitalId,
      branchId,
      patientId,
      lines: [
        {
          description: 'Zero GST',
          quantity: 1,
          unitPrice: 100,
          gstRate: 0,
          sortOrder: 0,
          sourceKey: `test.zero.gst.${runId}`,
        },
      ],
      outboxId: outbox.id,
      jobContext: { jobId: 'job-1', workerId: 'worker-1' },
      auditMetadata: { test: true },
    });

    expect(result.outcome).toBe('created');
  });

  itDb('rejects automated taxed draft line without HSN', async () => {
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId,
        eventType: 'test.gst.hsn.fail',
        entityType: 'Test',
        entityId: `fail-${runId}`,
        payload: {},
        status: 'PENDING',
        idempotencyKey: `test.gst.hsn.fail.${runId}`,
      },
    });

    await expect(
      draftLineBilling.createDraftInvoiceWithLines({
        hospitalId,
        branchId,
        patientId,
        lines: [
          {
            description: 'Taxed auto',
            quantity: 1,
            unitPrice: 500,
            gstRate: 18,
            sortOrder: 0,
            sourceKey: `test.taxed.no.hsn.${runId}`,
          },
        ],
        outboxId: outbox.id,
        jobContext: { jobId: 'job-2', workerId: 'worker-1' },
        auditMetadata: { test: true },
      }),
    ).rejects.toThrow(JobPermanentFailureError);
  });

  itDb('creates automated taxed draft line with valid HSN', async () => {
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId,
        eventType: 'test.gst.hsn.ok',
        entityType: 'Test',
        entityId: `ok-${runId}`,
        payload: {},
        status: 'PENDING',
        idempotencyKey: `test.gst.hsn.ok.${runId}`,
      },
    });

    const result = await draftLineBilling.createDraftInvoiceWithLines({
      hospitalId,
      branchId,
      patientId,
      lines: [
        {
          description: 'Taxed auto',
          quantity: 1,
          unitPrice: 500,
          gstRate: 18,
          hsnSac: '998311',
          sortOrder: 0,
          sourceKey: `test.taxed.hsn.${runId}`,
        },
      ],
      outboxId: outbox.id,
      jobContext: { jobId: 'job-3', workerId: 'worker-1' },
      auditMetadata: { test: true },
    });

    expect(result.outcome).toBe('created');
    if (result.invoiceId) {
      const item = await prisma.invoiceItem.findFirst({
        where: { invoiceId: result.invoiceId },
      });
      expect(item?.hsnSac).toBe('998311');
    }
  });

  itDb('rejects consultation fee config with GST but no HSN', async () => {
    await expect(
      billingService.updateConsultationFeeConfig(hospitalWideUser(), {
        unitPrice: 500,
        gstRate: 18,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  itDb('PharmacyProduct model has no GST/HSN fields (documented gap)', async () => {
    const product = await prisma.pharmacyProduct.create({
      data: {
        hospitalId,
        branchId,
        name: `Med ${runId}`,
        unit: 'tab',
        sku: `SKU-${runId}`,
      },
    });

    const keys = Object.keys(product);
    expect(keys).not.toContain('gstRate');
    expect(keys).not.toContain('hsnSac');
  });
});
