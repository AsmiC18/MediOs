import { BillingCatalogueItemType, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { createNoopReportProjectionBillingHook } from '../reports/report-projection.test-util';
import { BillingService } from './billing.service';

const VALID_GSTIN = '36AABCU9603R1Z5';

describe('Billing catalogue invoice snapshots', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;
  let billingService: BillingService;

  const user = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  const itDb = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!dbAvailable) return;
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

    const hospital = await prisma.hospital.create({
      data: {
        name: `CatInv ${runId}`,
        code: `CI-${runId}`,
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
      data: { hospitalId, name: `R-${runId}` },
    });

    const staff = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Bill',
        email: `ci-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = staff.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Pat',
        phone: `7${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect();
  });

  itDb('snapshots catalogue values and keeps invoice stable after catalogue price change', async () => {
    const catalogue = await prisma.billingCatalogueItem.create({
      data: {
        hospitalId,
        branchId,
        itemType: BillingCatalogueItemType.SERVICE,
        code: `SVC-${runId}`,
        name: 'Consultation Original',
        unitPrice: 500,
        gstRate: 18,
        hsnSac: '999311',
        isActive: true,
      },
    });

    const invoice = await billingService.create(user(), {
      patientId,
      branchId,
      placeOfSupplyStateCode: '36',
      items: [
        {
          billingCatalogueItemId: catalogue.id,
          quantity: 1,
        },
      ],
    });

    const line = invoice.items[0];
    expect(line.description).toBe('Consultation Original');
    expect(line.unitPrice.toString()).toBe('500');
    expect(line.gstRate.toString()).toBe('18');
    expect(line.hsnSac).toBe('999311');
    expect(line.billingCatalogueItemId).toBe(catalogue.id);
    expect(line.billingCatalogueCode).toBe(`SVC-${runId}`);

    await prisma.billingCatalogueItem.update({
      where: { id: catalogue.id },
      data: {
        name: 'Consultation Revised',
        unitPrice: 900,
        gstRate: 5,
        hsnSac: '999312',
      },
    });

    const reloaded = await billingService.findOne(user(), invoice.id);
    const reloadedLine = reloaded.items[0];
    expect(reloadedLine.description).toBe('Consultation Original');
    expect(reloadedLine.unitPrice.toString()).toBe('500');
    expect(reloadedLine.gstRate.toString()).toBe('18');
    expect(reloadedLine.hsnSac).toBe('999311');
  });
});
