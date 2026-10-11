import { PrismaClient } from '@prisma/client';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { JobService } from '../jobs/job.service';
import { PHARMACY_LOW_STOCK_EVENT_TYPE } from './jobs/pharmacy-inventory-alert.constants';
import { PharmacyInventoryScanService } from './jobs/pharmacy-inventory-scan.service';

describe('Pharmacy inventory scan (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let productId: string;
  let scanService: PharmacyInventoryScanService;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    scanService = new PharmacyInventoryScanService(
      prisma as never,
      new DomainEventOutboxService(prisma as never, new JobService(prisma as never)),
    );

    const hospital = await prisma.hospital.create({
      data: { name: `Pharm Inv ${runId}`, code: `PI-${runId}` },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;

    const product = await prisma.pharmacyProduct.create({
      data: {
        hospitalId,
        branchId,
        name: `Low stock med ${runId}`,
        unit: 'tab',
        sku: `LS-${runId}`,
        reorderLevel: 20,
      },
    });
    productId = product.id;

    await prisma.pharmacyBatch.create({
      data: {
        hospitalId,
        branchId,
        productId,
        batchNumber: `B-${runId}`,
        expiryDate: new Date('2028-01-01T00:00:00.000Z'),
        quantity: 5,
      },
    });
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  it('creates low-stock outbox once per window', async () => {
    if (!dbAvailable) {
      return;
    }

    const windowKey = `day-${runId}`;

    const first = await scanService.scanLowStock(hospitalId, windowKey);
    const second = await scanService.scanLowStock(hospitalId, windowKey);

    expect(first.alertsCreated).toBe(1);
    expect(second.alertsCreated).toBe(0);

    const outboxes = await prisma.domainEventOutbox.count({
      where: {
        hospitalId,
        eventType: PHARMACY_LOW_STOCK_EVENT_TYPE,
        entityId: productId,
      },
    });
    expect(outboxes).toBe(1);
  });
});
