import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PharmacyDispensingStatus,
  PharmacyStockMovementType,
  PrescriptionStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PharmacyService } from './pharmacy.service';

describe('PharmacyService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const productIdA = 'product-a';
  const batchIdA = 'batch-a';
  const batchIdB = 'batch-b';
  const dispensingIdB = 'dispensing-b';
  const prescriptionId = 'rx-1';
  const patientId = 'patient-1';

  const branchUser = {
    sub: 'user-branch-a',
    hospitalId,
    branchId: branchA,
  };

  const hospitalWideUser = {
    sub: 'user-hospital-wide',
    hospitalId,
    branchId: null as string | null,
  };

  let prisma: {
    pharmacyProduct: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    pharmacyBatch: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    pharmacyDispensing: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    pharmacyDispensingItem: { aggregate: jest.Mock };
    pharmacyStockMovement: { create: jest.Mock };
    prescription: { findUnique: jest.Mock };
    patient: { findUnique: jest.Mock };
    branch: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: PharmacyService;

  const productA = {
    id: productIdA,
    hospitalId,
    branchId: branchA,
    name: 'Paracetamol',
    unit: 'tablet',
    isActive: true,
    sku: null,
    reorderLevel: 0,
  };

  const batchA = {
    id: batchIdA,
    hospitalId,
    branchId: branchA,
    productId: productIdA,
    batchNumber: 'B001',
    expiryDate: new Date('2030-01-01'),
    quantity: 100,
    sellingPrice: null,
    product: productA,
  };

  beforeEach(() => {
    prisma = {
      pharmacyProduct: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      pharmacyBatch: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      pharmacyDispensing: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      pharmacyDispensingItem: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
      },
      pharmacyStockMovement: { create: jest.fn().mockResolvedValue({}) },
      prescription: { findUnique: jest.fn() },
      patient: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback) => {
        const txPharmacyBatch = {
          ...prisma.pharmacyBatch,
          findUnique: jest.fn().mockResolvedValue(batchA),
          update: prisma.pharmacyBatch.update,
        };

        return callback({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          pharmacyBatch: txPharmacyBatch,
          pharmacyStockMovement: prisma.pharmacyStockMovement,
          pharmacyDispensing: prisma.pharmacyDispensing,
        });
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new PharmacyService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      { enqueueForDispensing: jest.fn().mockResolvedValue(undefined) } as never,
    );
  });

  describe('listProducts and listBatches', () => {
    it('scopes branch user product list to JWT branch', async () => {
      await service.listProducts(branchUser, { branchId: branchB });

      const where = prisma.pharmacyProduct.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
    });

    it('allows hospital-wide user to filter products by branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      await service.listProducts(hospitalWideUser, { branchId: branchB });

      const where = prisma.pharmacyProduct.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
    });

    it('scopes branch user batch list to JWT branch', async () => {
      await service.listBatches(branchUser, { branchId: branchB });

      const where = prisma.pharmacyBatch.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
    });
  });

  describe('getProduct and getBatch', () => {
    it('allows branch user to get own-branch product', async () => {
      prisma.pharmacyProduct.findUnique.mockResolvedValue(productA);

      const product = await service.getProduct(branchUser, productIdA);

      expect(product.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch product', async () => {
      prisma.pharmacyProduct.findUnique.mockResolvedValue({
        ...productA,
        branchId: branchB,
      });

      await expect(service.getProduct(branchUser, productIdA)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('denies branch user access to another branch batch', async () => {
      prisma.pharmacyBatch.findUnique.mockResolvedValue({
        ...batchA,
        id: batchIdB,
        branchId: branchB,
      });

      await expect(service.getBatch(branchUser, batchIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital product as not found', async () => {
      prisma.pharmacyProduct.findUnique.mockResolvedValue(null);

      await expect(service.getProduct(branchUser, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createProduct', () => {
    it('forces JWT branch for branch-scoped user', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchA, hospitalId });
      prisma.pharmacyProduct.create.mockResolvedValue({ ...productA });

      const product = await service.createProduct(branchUser, {
        name: 'Ibuprofen',
        unit: 'tablet',
        branchId: branchB,
      });

      expect(product.branchId).toBe(branchA);
      expect(prisma.pharmacyProduct.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });
  });

  describe('adjustStock', () => {
    it('allows branch user to adjust own-branch stock', async () => {
      prisma.pharmacyBatch.findUnique.mockResolvedValue(batchA);
      prisma.pharmacyBatch.update.mockResolvedValue({
        ...batchA,
        quantity: 110,
      });

      const updated = await service.adjustStock(branchUser, {
        batchId: batchIdA,
        movementType: PharmacyStockMovementType.ADJUSTMENT_IN,
        quantity: 10,
      });

      expect(updated.quantity).toBe(110);
    });

    it('denies branch user adjusting another branch batch', async () => {
      prisma.pharmacyBatch.findUnique.mockResolvedValue({
        ...batchA,
        id: batchIdB,
        branchId: branchB,
      });

      await expect(
        service.adjustStock(branchUser, {
          batchId: batchIdB,
          movementType: PharmacyStockMovementType.ADJUSTMENT_IN,
          quantity: 5,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves insufficient stock rule for authorized user', async () => {
      prisma.pharmacyBatch.findUnique.mockResolvedValue(batchA);

      await expect(
        service.adjustStock(branchUser, {
          batchId: batchIdA,
          movementType: PharmacyStockMovementType.ADJUSTMENT_OUT,
          quantity: 500,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createDispensing', () => {
    const prescriptionItemId = 'rx-item-1';

    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
        mergedIntoPatientId: null,
      });
      prisma.pharmacyProduct.findUnique.mockResolvedValue(productA);
    });

    it('denies branch user dispensing from another branch encounter', async () => {
      prisma.prescription.findUnique.mockResolvedValue({
        id: prescriptionId,
        hospitalId,
        patientId,
        status: PrescriptionStatus.ISSUED,
        items: [
          { id: prescriptionItemId, quantity: 10, medicationName: 'Med' },
        ],
        encounter: { branchId: branchB },
      });

      await expect(
        service.createDispensing(branchUser, {
          patientId,
          prescriptionId,
          branchId: branchA,
          items: [
            {
              prescriptionItemId,
              productId: productIdA,
              batchId: batchIdA,
              quantity: 1,
            },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user dispensing using another branch batch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchA, hospitalId });
      prisma.prescription.findUnique.mockResolvedValue({
        id: prescriptionId,
        hospitalId,
        patientId,
        status: PrescriptionStatus.ISSUED,
        items: [
          { id: prescriptionItemId, quantity: 10, medicationName: 'Med' },
        ],
        encounter: { branchId: branchA },
      });
      prisma.pharmacyBatch.findUnique.mockResolvedValue({
        ...batchA,
        id: batchIdB,
        branchId: branchB,
      });

      await expect(
        service.createDispensing(branchUser, {
          patientId,
          prescriptionId,
          items: [
            {
              prescriptionItemId,
              productId: productIdA,
              batchId: batchIdB,
              quantity: 1,
            },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('dispensing read and cancel', () => {
    const dispensingRecord = {
      id: dispensingIdB,
      hospitalId,
      branchId: branchB,
      patientId,
      prescriptionId,
      status: PharmacyDispensingStatus.DISPENSED,
      items: [{ batchId: batchIdB, productId: productIdA, quantity: 1 }],
      patient: {},
      prescription: {},
      createdBy: {},
    };

    it('denies branch user getting another branch dispensing', async () => {
      prisma.pharmacyDispensing.findUnique.mockResolvedValue(dispensingRecord);

      await expect(
        service.getDispensing(branchUser, dispensingIdB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user cancelling another branch dispensing', async () => {
      prisma.pharmacyDispensing.findUnique.mockResolvedValue(dispensingRecord);

      await expect(
        service.cancelDispensing(branchUser, dispensingIdB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('scopes branch user dispensing list to JWT branch', async () => {
      await service.listDispensings(branchUser, {});

      const where = prisma.pharmacyDispensing.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
    });

    it('preserves cancel status rule for authorized branch user', async () => {
      prisma.pharmacyDispensing.findUnique.mockResolvedValue({
        ...dispensingRecord,
        id: 'dispensing-a',
        branchId: branchA,
        status: PharmacyDispensingStatus.CANCELLED,
        items: [],
      });

      await expect(
        service.cancelDispensing(branchUser, 'dispensing-a'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
