import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { createNoopReportProjectionBillingHook } from '../reports/report-projection.test-util';
import { BillingService } from './billing.service';

describe('BillingService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const patientId = 'patient-1';
  const invoiceIdA = 'invoice-a';
  const invoiceIdB = 'invoice-b';

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

  const zeroTaxLineItem = {
    description: 'Consultation',
    quantity: 1,
    unitPrice: 500,
    gstRate: 0,
  };

  let prisma: {
    invoice: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    invoiceItem: { findMany: jest.Mock; deleteMany: jest.Mock };
    patient: { findUnique: jest.Mock };
    hospital: { findUnique: jest.Mock };
    branch: { findUnique: jest.Mock };
    payment: { findMany: jest.Mock };
    refund: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: BillingService;

  const draftInvoiceA = {
    id: invoiceIdA,
    hospitalId,
    branchId: branchA,
    patientId,
    invoiceNumber: 'INV-000001',
    status: InvoiceStatus.DRAFT,
    currency: 'INR',
    subtotalAmount: new Prisma.Decimal(500),
    cgstAmount: new Prisma.Decimal(0),
    sgstAmount: new Prisma.Decimal(0),
    igstAmount: new Prisma.Decimal(0),
    taxAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(500),
    placeOfSupplyStateCode: null,
    items: [],
  };

  beforeEach(() => {
    prisma = {
      invoice: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      invoiceItem: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      patient: { findUnique: jest.fn() },
      hospital: {
        findUnique: jest.fn().mockResolvedValue({
          id: hospitalId,
          stateCode: null,
          gstin: null,
        }),
      },
      branch: { findUnique: jest.fn() },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      refund: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((arg) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg.map((op) => op));
        }

        return arg({
          invoice: prisma.invoice,
          invoiceItem: prisma.invoiceItem,
        });
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new BillingService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      createNoopReportProjectionBillingHook(),
    );
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.invoice.findMany.mockResolvedValue([]);
    });

    it('scopes branch user list to JWT branch and ignores query branchId', async () => {
      await service.findAll(branchUser, { branchId: branchB });

      const where = prisma.invoice.findMany.mock.calls[0][0].where;
      expect(where.hospitalId).toBe(hospitalId);
      expect(where.branchId).toBe(branchA);
    });

    it('preserves status filter under branch scope', async () => {
      await service.findAll(branchUser, { status: InvoiceStatus.ISSUED });

      const where = prisma.invoice.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
      expect(where.status).toBe(InvoiceStatus.ISSUED);
    });

    it('allows hospital-wide user to filter by branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      await service.findAll(hospitalWideUser, { branchId: branchB });

      const where = prisma.invoice.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
    });

    it('allows hospital-wide user to list all branches', async () => {
      await service.findAll(hospitalWideUser, {});

      const where = prisma.invoice.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('allows branch user to get same-branch invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...draftInvoiceA,
        items: [],
        patient: {},
      });

      const invoice = await service.findOne(branchUser, invoiceIdA);

      expect(invoice.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...draftInvoiceA,
        id: invoiceIdB,
        branchId: branchB,
        items: [],
        patient: {},
      });

      await expect(service.findOne(branchUser, invoiceIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital isolation as not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(branchUser, 'invoice-other-hospital'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
        mergedIntoPatientId: null,
      });
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockImplementation(({ data, include }) =>
        Promise.resolve({
          id: 'invoice-new',
          ...data,
          items: [],
          patient: {},
          ...(include ? {} : {}),
        }),
      );
    });

    it('forces JWT branch for branch-scoped user even when DTO requests another branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchA, hospitalId });

      const invoice = await service.create(branchUser, {
        patientId,
        branchId: branchB,
        items: [zeroTaxLineItem],
      });

      expect(invoice.branchId).toBe(branchA);
      expect(prisma.invoice.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('allows hospital-wide user to create invoice with chosen branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      const invoice = await service.create(hospitalWideUser, {
        patientId,
        branchId: branchB,
        items: [zeroTaxLineItem],
      });

      expect(invoice.branchId).toBe(branchB);
    });
  });

  describe('update and status', () => {
    it('allows branch user to update own-branch draft invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(draftInvoiceA);
      prisma.invoice.update.mockResolvedValue({
        ...draftInvoiceA,
        notes: 'Updated',
        items: [],
        patient: {},
      });

      const updated = await service.update(branchUser, invoiceIdA, {
        notes: 'Updated',
      });

      expect(updated.notes).toBe('Updated');
    });

    it('denies branch user updating another branch invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...draftInvoiceA,
        id: invoiceIdB,
        branchId: branchB,
      });

      await expect(
        service.update(branchUser, invoiceIdB, { notes: 'Blocked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user reassigning invoice to another branch', async () => {
      prisma.invoice.findFirst.mockResolvedValue(draftInvoiceA);

      await expect(
        service.update(branchUser, invoiceIdA, { branchId: branchB }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves draft-only edit rule for same-branch user', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...draftInvoiceA,
        status: InvoiceStatus.ISSUED,
      });

      await expect(
        service.update(branchUser, invoiceIdA, { notes: 'Too late' }),
      ).rejects.toThrow(ConflictException);
    });

    it('denies branch user status change on another branch invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...draftInvoiceA,
        id: invoiceIdB,
        branchId: branchB,
        status: InvoiceStatus.DRAFT,
      });

      await expect(
        service.updateStatus(branchUser, invoiceIdB, {
          status: InvoiceStatus.ISSUED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReconciliation', () => {
    it('denies branch user reconciliation for another branch invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...draftInvoiceA,
        id: invoiceIdB,
        branchId: branchB,
        status: InvoiceStatus.ISSUED,
      });

      await expect(
        service.getReconciliation(branchUser, invoiceIdB),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
