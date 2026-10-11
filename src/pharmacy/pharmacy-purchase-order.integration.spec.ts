import {
  PharmacyPurchaseOrderStatus,
  PharmacyStockMovementType,
  PrismaClient,
} from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PharmacyPurchaseOrderService } from './pharmacy-purchase-order.service';
import { PharmacySupplierService } from './pharmacy-supplier.service';
import { PharmacyService } from './pharmacy.service';

describe('Pharmacy purchase orders (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let otherBranchId: string;
  let userId: string;
  let productId: string;
  let supplierId: string;

  let poService: PharmacyPurchaseOrderService;
  let supplierService: PharmacySupplierService;
  let pharmacyService: PharmacyService;

  const user = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  const branchUser = () => ({
    sub: userId,
    hospitalId,
    branchId,
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    const audit = new AuditService(prisma as never);
    poService = new PharmacyPurchaseOrderService(prisma as never, audit);
    supplierService = new PharmacySupplierService(prisma as never, audit);
    pharmacyService = new PharmacyService(
      prisma as never,
      audit,
      { enqueueForDispensing: jest.fn() } as never,
    );

    const hospital = await prisma.hospital.create({
      data: { name: `PO ${runId}`, code: `PO-${runId}` },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;

    const otherBranch = await prisma.branch.create({
      data: { hospitalId, name: 'Other', code: `OB-${runId}` },
    });
    otherBranchId = otherBranch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Role-${runId}` },
    });

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Pharmacist',
        email: `po-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = admin.id;

    const product = await pharmacyService.createProduct(user(), {
      name: `Paracetamol ${runId}`,
      unit: 'tab',
      branchId,
      sku: `SKU-${runId}`,
    });
    productId = product.id;

    const supplier = await supplierService.createSupplier(user(), {
      name: `Supplier ${runId}`,
      code: `SUP-${runId}`,
    });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  async function createApprovedPo(orderedQty = 100) {
    const po = await poService.createPurchaseOrder(user(), {
      supplierId,
      branchId,
      items: [{ productId, orderedQuantity: orderedQty, unitCost: 2.5 }],
    });
    await poService.submitPurchaseOrder(user(), po.id);
    return poService.approvePurchaseOrder(user(), po.id);
  }

  itWithDb('creates supplier and draft PO with PO number', async () => {
    const po = await poService.createPurchaseOrder(user(), {
      supplierId,
      branchId,
      notes: 'Urgent',
      items: [{ productId, orderedQuantity: 50 }],
    });

    expect(po.status).toBe(PharmacyPurchaseOrderStatus.DRAFT);
    expect(po.poNumber).toMatch(/^PO-\d{6}$/);
    expect(po.items[0].remainingQuantity).toBe(50);
  });

  itWithDb('rejects invalid state transition submit from approved', async () => {
    const approved = await createApprovedPo(10);
    await expect(
      poService.submitPurchaseOrder(user(), approved.id),
    ).rejects.toThrow(BadRequestException);
  });

  itWithDb('receipt increases batch stock and creates PURCHASE movement', async () => {
    const approved = await createApprovedPo(40);
    const expiry = '2027-06-01T00:00:00.000Z';

    const receipt = await poService.receiveStock(user(), approved.id, {
      idempotencyKey: `receipt-${runId}-1`,
      lines: [
        {
          purchaseOrderItemId: approved.items[0].id,
          quantity: 40,
          batchNumber: `B-${runId}`,
          expiryDate: expiry,
        },
      ],
    });

    expect(receipt.lines).toHaveLength(1);

    const batch = await prisma.pharmacyBatch.findFirstOrThrow({
      where: { hospitalId, batchNumber: `B-${runId}` },
    });
    expect(batch.quantity).toBe(40);

    const movements = await prisma.pharmacyStockMovement.findMany({
      where: {
        hospitalId,
        referenceType: 'PharmacyPurchaseOrderReceipt',
        referenceId: receipt.id,
        movementType: PharmacyStockMovementType.PURCHASE,
      },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].quantity).toBe(40);

    const po = await poService.getPurchaseOrder(user(), approved.id);
    expect(po.status).toBe(PharmacyPurchaseOrderStatus.RECEIVED);
    expect(po.items[0].receivedQuantity).toBe(40);
  });

  itWithDb('partial receipt then final receipt updates status', async () => {
    const approved = await createApprovedPo(30);

    await poService.receiveStock(user(), approved.id, {
      idempotencyKey: `receipt-partial-${runId}`,
      lines: [
        {
          purchaseOrderItemId: approved.items[0].id,
          quantity: 10,
          batchNumber: `BP-${runId}`,
          expiryDate: '2027-07-01T00:00:00.000Z',
        },
      ],
    });

    let po = await poService.getPurchaseOrder(user(), approved.id);
    expect(po.status).toBe(PharmacyPurchaseOrderStatus.PARTIALLY_RECEIVED);
    expect(po.items[0].remainingQuantity).toBe(20);

    await poService.receiveStock(user(), approved.id, {
      idempotencyKey: `receipt-final-${runId}`,
      lines: [
        {
          purchaseOrderItemId: approved.items[0].id,
          quantity: 20,
          batchNumber: `BP-${runId}`,
          expiryDate: '2027-07-01T00:00:00.000Z',
        },
      ],
    });

    po = await poService.getPurchaseOrder(user(), approved.id);
    expect(po.status).toBe(PharmacyPurchaseOrderStatus.RECEIVED);

    const batch = await prisma.pharmacyBatch.findFirstOrThrow({
      where: { batchNumber: `BP-${runId}` },
    });
    expect(batch.quantity).toBe(30);
  });

  itWithDb('rejects over-receipt', async () => {
    const approved = await createApprovedPo(5);

    await expect(
      poService.receiveStock(user(), approved.id, {
        idempotencyKey: `receipt-over-${runId}`,
        lines: [
          {
            purchaseOrderItemId: approved.items[0].id,
            quantity: 6,
            batchNumber: `BO-${runId}`,
            expiryDate: '2027-08-01T00:00:00.000Z',
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  itWithDb('concurrent full-quantity receipts cannot over-receive PO', async () => {
    const approved = await createApprovedPo(10);
    const itemId = approved.items[0].id;
    const expiry = '2027-10-01T00:00:00.000Z';

    const results = await Promise.allSettled([
      poService.receiveStock(user(), approved.id, {
        idempotencyKey: `receipt-race-a-${runId}`,
        lines: [
          {
            purchaseOrderItemId: itemId,
            quantity: 10,
            batchNumber: `BR-A-${runId}`,
            expiryDate: expiry,
          },
        ],
      }),
      poService.receiveStock(user(), approved.id, {
        idempotencyKey: `receipt-race-b-${runId}`,
        lines: [
          {
            purchaseOrderItemId: itemId,
            quantity: 10,
            batchNumber: `BR-B-${runId}`,
            expiryDate: expiry,
          },
        ],
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const po = await poService.getPurchaseOrder(user(), approved.id);
    expect(po.items[0].receivedQuantity).toBe(10);

    const totalStock = await prisma.pharmacyBatch.aggregate({
      where: {
        hospitalId,
        productId,
        batchNumber: { in: [`BR-A-${runId}`, `BR-B-${runId}`] },
      },
      _sum: { quantity: true },
    });
    expect(totalStock._sum.quantity).toBe(10);
  });

  itWithDb('duplicate idempotency key does not double stock', async () => {
    const approved = await createApprovedPo(15);
    const key = `receipt-dup-${runId}`;
    const line = {
      purchaseOrderItemId: approved.items[0].id,
      quantity: 15,
      batchNumber: `BD-${runId}`,
      expiryDate: '2027-09-01T00:00:00.000Z',
    };

    await poService.receiveStock(user(), approved.id, {
      idempotencyKey: key,
      lines: [line],
    });
    await poService.receiveStock(user(), approved.id, {
      idempotencyKey: key,
      lines: [line],
    });

    const batch = await prisma.pharmacyBatch.findFirstOrThrow({
      where: { batchNumber: `BD-${runId}` },
    });
    expect(batch.quantity).toBe(15);

    const receipts = await prisma.pharmacyPurchaseOrderReceipt.count({
      where: { hospitalId, idempotencyKey: key },
    });
    expect(receipts).toBe(1);
  });

  itWithDb('branch user cannot access PO in another branch', async () => {
    const otherProduct = await pharmacyService.createProduct(user(), {
      name: `Other branch product ${runId}`,
      unit: 'tab',
      branchId: otherBranchId,
      sku: `SKU-OB-${runId}`,
    });

    const po = await poService.createPurchaseOrder(user(), {
      supplierId,
      branchId: otherBranchId,
      items: [{ productId: otherProduct.id, orderedQuantity: 5 }],
    });

    await expect(
      poService.getPurchaseOrder(branchUser(), po.id),
    ).rejects.toThrow(ForbiddenException);
  });

  itWithDb('supplier hospital isolation', async () => {
    const otherHospital = await prisma.hospital.create({
      data: { name: `Other H ${runId}`, code: `OH-${runId}` },
    });

    await expect(
      supplierService.getSupplier(
        { sub: userId, hospitalId: otherHospital.id, branchId: null },
        supplierId,
      ),
    ).rejects.toThrow();
  });
});
