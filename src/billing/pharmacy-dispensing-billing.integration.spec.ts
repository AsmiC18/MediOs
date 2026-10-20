import {
  BillingCatalogueItemType,
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  DomainEventOutboxStatus,
  GstSupplyType,
  PharmacyDispensingStatus,
  PrescriptionStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { JobService } from '../jobs/job.service';
import { buildPharmacyDispensingBillingDomainEvent } from './pharmacy-dispensing-billing-event.util';
import { PharmacyDispensingBillingService } from './pharmacy-dispensing-billing.service';

const VALID_GSTIN = '36AABCU9603R1Z5';

describe('Pharmacy dispensing billing (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;
  let productId: string;
  let batchId: string;
  let prescriptionId: string;
  let prescriptionItemId: string;

  let billingService: PharmacyDispensingBillingService;

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
    const outboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    billingService = new PharmacyDispensingBillingService(
      prisma as never,
      outboxService,
      auditService,
    );

    const hospital = await prisma.hospital.create({
      data: {
        name: `PharmBill ${runId}`,
        code: `PB-${runId}`,
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
        name: 'Pharmacist',
        email: `pb-${runId}@example.com`,
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
        phone: `5${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;

    const product = await prisma.pharmacyProduct.create({
      data: {
        hospitalId,
        branchId,
        name: `Product ${runId}`,
        unit: 'tab',
        sku: `SKU-PB-${runId}`,
      },
    });
    productId = product.id;

    const batch = await prisma.pharmacyBatch.create({
      data: {
        hospitalId,
        branchId,
        productId,
        batchNumber: `BAT-PB-${runId}`,
        expiryDate: new Date('2029-01-01T00:00:00.000Z'),
        quantity: 100,
        sellingPrice: new Prisma.Decimal(999),
      },
    });
    batchId = batch.id;

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

    const prescription = await prisma.prescription.create({
      data: {
        hospitalId,
        encounterId: encounter.id,
        patientId,
        prescribedByUserId: userId,
        status: PrescriptionStatus.ACTIVE,
        items: {
          create: [{ medicationName: 'Tab Med', quantity: 10 }],
        },
      },
      include: { items: true },
    });
    prescriptionId = prescription.id;
    prescriptionItemId = prescription.items[0]!.id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  async function createProductWithDispensingOutbox(
    skuSuffix: string,
    unitPrice: number,
    productIdOverride?: string,
    batchIdOverride?: string,
  ) {
    let useProductId = productIdOverride ?? productId;
    let useBatchId = batchIdOverride ?? batchId;

    if (!productIdOverride) {
      const product = await prisma.pharmacyProduct.create({
        data: {
          hospitalId,
          branchId,
          name: `Prod ${skuSuffix}`,
          unit: 'tab',
          sku: `SKU-${skuSuffix}-${runId}`,
        },
      });
      useProductId = product.id;
      const batch = await prisma.pharmacyBatch.create({
        data: {
          hospitalId,
          branchId,
          productId: product.id,
          batchNumber: `BAT-${skuSuffix}-${runId}`,
          expiryDate: new Date('2029-03-01T00:00:00.000Z'),
          quantity: 50,
          sellingPrice: new Prisma.Decimal(999),
        },
      });
      useBatchId = batch.id;
    }

    const dispensing = await prisma.pharmacyDispensing.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        prescriptionId,
        createdByUserId: userId,
        status: PharmacyDispensingStatus.DISPENSED,
        dispensedAt: new Date(),
        items: {
          create: [
            {
              prescriptionItemId,
              productId: useProductId,
              batchId: useBatchId,
              quantity: 1,
              unitPrice: new Prisma.Decimal(unitPrice),
            },
          ],
        },
      },
    });

    const event = buildPharmacyDispensingBillingDomainEvent({
      dispensingId: dispensing.id,
      patientId,
      hospitalId,
      branchId,
    });

    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId,
        branchId,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        idempotencyKey: `${event.idempotencyKey}:${skuSuffix}`,
        payload: event.payload as Prisma.InputJsonValue,
        status: DomainEventOutboxStatus.PENDING,
      },
    });

    return { productId: useProductId, outboxId: outbox.id };
  }

  itDb('applies catalogue GST/HSN and snapshots catalogue ids while keeping dispense unit price', async () => {
    const { productId: taxedProductId, outboxId } =
      await createProductWithDispensingOutbox('TAXED', 25.5);

    const catalogue = await prisma.billingCatalogueItem.create({
      data: {
        hospitalId,
        branchId,
        itemType: BillingCatalogueItemType.MEDICINE_REFERENCE,
        code: `MED-${runId}-TAX`,
        name: 'Catalogue price ignored',
        unitPrice: 999,
        gstRate: 18,
        hsnSac: '30049099',
        pharmacyProductId: taxedProductId,
        isActive: true,
      },
    });

    const dispenseUnitPrice = 25.5;

    const result = await billingService.processOutboxEvent(
      hospitalId,
      outboxId,
      { jobId: 'job-tax', workerId: 'worker-tax' },
    );

    expect(result.outcome).toBe('created');

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.invoiceId! },
      include: { items: true },
    });

    expect(invoice.supplyType).toBe(GstSupplyType.INTRA_STATE);
    expect(invoice.cgstAmount.toNumber()).toBe(2.3);
    expect(invoice.sgstAmount.toNumber()).toBe(2.3);
    expect(invoice.totalAmount.toNumber()).toBe(30.1);

    const line = invoice.items[0]!;
    expect(line.unitPrice.toNumber()).toBe(dispenseUnitPrice);
    expect(line.gstRate.toNumber()).toBe(18);
    expect(line.hsnSac).toBe('30049099');
    expect(line.billingCatalogueItemId).toBe(catalogue.id);
    expect(line.billingCatalogueCode).toBe(`MED-${runId}-TAX`);
  });

  itDb('prefers branch-specific catalogue over hospital-wide for the same product', async () => {
    const dispenseUnitPrice = 50;
    const { productId: sharedProductId, outboxId } =
      await createProductWithDispensingOutbox('BRANCHCAT', dispenseUnitPrice);

    await prisma.billingCatalogueItem.create({
      data: {
        hospitalId,
        branchId: null,
        itemType: BillingCatalogueItemType.MEDICINE_REFERENCE,
        code: `MED-${runId}-HW`,
        name: 'Hospital-wide (should lose)',
        unitPrice: 888,
        gstRate: 18,
        hsnSac: '30049099',
        pharmacyProductId: sharedProductId,
        isActive: true,
      },
    });

    const branchCatalogue = await prisma.billingCatalogueItem.create({
      data: {
        hospitalId,
        branchId,
        itemType: BillingCatalogueItemType.MEDICINE_REFERENCE,
        code: `MED-${runId}-BR`,
        name: 'Branch catalogue (should win)',
        unitPrice: 777,
        gstRate: 12,
        hsnSac: '30041090',
        pharmacyProductId: sharedProductId,
        isActive: true,
      },
    });

    const result = await billingService.processOutboxEvent(
      hospitalId,
      outboxId,
      { jobId: 'job-branch-cat', workerId: 'worker-branch-cat' },
    );

    expect(result.outcome).toBe('created');

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.invoiceId! },
      include: { items: true },
    });

    expect(invoice.supplyType).toBe(GstSupplyType.INTRA_STATE);
    expect(invoice.cgstAmount.toNumber()).toBe(3);
    expect(invoice.sgstAmount.toNumber()).toBe(3);
    expect(invoice.totalAmount.toNumber()).toBe(56);

    const line = invoice.items[0]!;
    expect(line.unitPrice.toNumber()).toBe(dispenseUnitPrice);
    expect(line.gstRate.toNumber()).toBe(12);
    expect(line.hsnSac).toBe('30041090');
    expect(line.billingCatalogueItemId).toBe(branchCatalogue.id);
    expect(line.billingCatalogueCode).toBe(`MED-${runId}-BR`);
  });

  itDb('fails permanently when catalogue has GST but no valid HSN', async () => {
    const { productId: badProductId, outboxId } =
      await createProductWithDispensingOutbox('BADHSN', 10);

    await prisma.billingCatalogueItem.create({
      data: {
        hospitalId,
        itemType: BillingCatalogueItemType.MEDICINE_REFERENCE,
        code: `MED-${runId}-BAD`,
        name: 'Missing HSN',
        unitPrice: 50,
        gstRate: 18,
        hsnSac: null,
        pharmacyProductId: badProductId,
        isActive: true,
      },
    });

    const invoicesBefore = await prisma.invoice.count({ where: { hospitalId } });

    await expect(
      billingService.processOutboxEvent(hospitalId, outboxId, {
        jobId: 'job-bad-hsn',
        workerId: 'worker-bad-hsn',
      }),
    ).rejects.toBeInstanceOf(JobPermanentFailureError);

    const invoicesAfter = await prisma.invoice.count({ where: { hospitalId } });
    expect(invoicesAfter).toBe(invoicesBefore);
  });

  itDb('preserves zero GST when no catalogue is linked', async () => {
    const orphanProduct = await prisma.pharmacyProduct.create({
      data: {
        hospitalId,
        branchId,
        name: `Orphan ${runId}`,
        unit: 'tab',
        sku: `SKU-OR-${runId}`,
      },
    });

    const orphanBatch = await prisma.pharmacyBatch.create({
      data: {
        hospitalId,
        branchId,
        productId: orphanProduct.id,
        batchNumber: `BAT-OR-${runId}`,
        expiryDate: new Date('2029-06-01T00:00:00.000Z'),
        quantity: 10,
        sellingPrice: new Prisma.Decimal(5),
      },
    });

    const dispensing = await prisma.pharmacyDispensing.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        prescriptionId,
        createdByUserId: userId,
        status: PharmacyDispensingStatus.DISPENSED,
        dispensedAt: new Date(),
        items: {
          create: [
            {
              prescriptionItemId,
              productId: orphanProduct.id,
              batchId: orphanBatch.id,
              quantity: 1,
              unitPrice: new Prisma.Decimal(12),
            },
          ],
        },
      },
    });

    const event = buildPharmacyDispensingBillingDomainEvent({
      dispensingId: dispensing.id,
      patientId,
      hospitalId,
      branchId,
    });

    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId,
        branchId,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        idempotencyKey: `${event.idempotencyKey}:orphan`,
        payload: event.payload as Prisma.InputJsonValue,
        status: DomainEventOutboxStatus.PENDING,
      },
    });

    const result = await billingService.processOutboxEvent(
      hospitalId,
      outbox.id,
      { jobId: 'job-zero', workerId: 'worker-zero' },
    );

    expect(result.outcome).toBe('created');
    const line = await prisma.invoiceItem.findFirstOrThrow({
      where: { invoiceId: result.invoiceId! },
    });
    expect(line.gstRate.toNumber()).toBe(0);
    expect(line.hsnSac).toBeNull();
    expect(line.billingCatalogueItemId).toBeNull();
  });

  itDb('fails permanently when multiple hospital-wide catalogues match one product', async () => {
    const dupProduct = await prisma.pharmacyProduct.create({
      data: {
        hospitalId,
        name: `Dup ${runId}`,
        unit: 'tab',
        sku: `SKU-DUP-${runId}`,
      },
    });

    await prisma.billingCatalogueItem.createMany({
      data: [
        {
          hospitalId,
          itemType: BillingCatalogueItemType.MEDICINE_REFERENCE,
          code: `DUP-A-${runId}`,
          name: 'Dup A',
          unitPrice: 10,
          gstRate: 5,
          hsnSac: '3004',
          pharmacyProductId: dupProduct.id,
          isActive: true,
        },
        {
          hospitalId,
          itemType: BillingCatalogueItemType.MEDICINE_REFERENCE,
          code: `DUP-B-${runId}`,
          name: 'Dup B',
          unitPrice: 10,
          gstRate: 5,
          hsnSac: '3005',
          pharmacyProductId: dupProduct.id,
          isActive: true,
        },
      ],
    });

    const dupBatch = await prisma.pharmacyBatch.create({
      data: {
        hospitalId,
        productId: dupProduct.id,
        batchNumber: `BAT-DUP-${runId}`,
        expiryDate: new Date('2029-06-01T00:00:00.000Z'),
        quantity: 5,
      },
    });

    const dispensing = await prisma.pharmacyDispensing.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        prescriptionId,
        createdByUserId: userId,
        status: PharmacyDispensingStatus.DISPENSED,
        dispensedAt: new Date(),
        items: {
          create: [
            {
              prescriptionItemId,
              productId: dupProduct.id,
              batchId: dupBatch.id,
              quantity: 1,
              unitPrice: new Prisma.Decimal(20),
            },
          ],
        },
      },
    });

    const event = buildPharmacyDispensingBillingDomainEvent({
      dispensingId: dispensing.id,
      patientId,
      hospitalId,
      branchId,
    });

    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId,
        branchId,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        idempotencyKey: `${event.idempotencyKey}:ambiguous`,
        payload: event.payload as Prisma.InputJsonValue,
        status: DomainEventOutboxStatus.PENDING,
      },
    });

    await expect(
      billingService.processOutboxEvent(hospitalId, outbox.id, {
        jobId: 'job-ambig',
        workerId: 'worker-ambig',
      }),
    ).rejects.toBeInstanceOf(JobPermanentFailureError);
  });
});
