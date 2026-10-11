import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus, PaymentStatus, Prisma, RefundStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  ReportExportDto,
  ReportExportFormat,
  ReportExportType,
} from './dto/report-export.dto';
import { createPassThroughReportProjectionService } from './report-projection.test-util';
import { ReportsService } from './reports.service';
import { MAX_HSN_BREAKDOWN_ROWS } from './reports.types';

describe('ReportsService', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const hospitalWideUser = {
    sub: 'admin-1',
    hospitalId,
    branchId: null as string | null,
  };

  const filters = {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-31T00:00:00.000Z',
  };

  let prisma: {
    $transaction: jest.Mock;
    invoice: { aggregate: jest.Mock };
    payment: { aggregate: jest.Mock };
    refund: { aggregate: jest.Mock };
    invoiceItem: { groupBy: jest.Mock };
    branch: { findUnique: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      invoice: { aggregate: jest.fn() },
      payment: { aggregate: jest.fn() },
      refund: { aggregate: jest.fn() },
      invoiceItem: { groupBy: jest.fn() },
      branch: { findUnique: jest.fn() },
    };
    auditService = { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      createPassThroughReportProjectionService(),
    );
  });

  describe('getFinancialSummary', () => {
    it('aggregates invoices, payments, refunds and net collected', async () => {
      prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      );
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { _all: 2 },
        _sum: { totalAmount: new Prisma.Decimal('2500.00') },
      });
      prisma.payment.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: { amount: new Prisma.Decimal('1000.00') },
      });
      prisma.refund.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: { amount: new Prisma.Decimal('150.00') },
      });

      const result = await service.getFinancialSummary(hospitalWideUser, filters);

      expect(result.invoicesIssuedInRange.count).toBe(2);
      expect(result.invoicesIssuedInRange.totalAmount).toBe('2500.00');
      expect(result.paymentsSucceededInRange.count).toBe(1);
      expect(result.paymentsSucceededInRange.totalAmount).toBe('1000.00');
      expect(result.refundsSucceededInRange.count).toBe(1);
      expect(result.refundsSucceededInRange.totalAmount).toBe('150.00');
      expect(result.netCashCollected).toBe('850.00');
      expect(result.invoiceCount).toBe(2);
      expect(result.netCollected).toBe('850.00');

      const invoiceWhere = prisma.invoice.aggregate.mock.calls[0][0].where;
      expect(invoiceWhere.hospitalId).toBe(hospitalId);
      expect(invoiceWhere.status.in).toEqual([
        InvoiceStatus.ISSUED,
        InvoiceStatus.PAID,
      ]);
      expect(invoiceWhere.issuedAt).toEqual(
        expect.objectContaining({
          gte: new Date(filters.from),
          lt: new Date(filters.to),
        }),
      );

      const paymentWhere = prisma.payment.aggregate.mock.calls[0][0].where;
      expect(paymentWhere.status).toBe(PaymentStatus.SUCCEEDED);

      const refundWhere = prisma.refund.aggregate.mock.calls[0][0].where;
      expect(refundWhere.status).toBe(RefundStatus.SUCCEEDED);
    });

    it('returns zeros for an empty range', async () => {
      prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      );
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { totalAmount: null },
      });
      prisma.payment.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { amount: null },
      });
      prisma.refund.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { amount: null },
      });

      const result = await service.getFinancialSummary(hospitalWideUser, filters);

      expect(result.invoiceCount).toBe(0);
      expect(result.invoiceTotal).toBe('0.00');
      expect(result.netCollected).toBe('0.00');
    });

    it('rejects invalid date range', async () => {
      await expect(
        service.getFinancialSummary(hospitalWideUser, {
          from: '2026-02-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getGstSummary', () => {
    it('filters invoices by issuedAt window (null issuedAt excluded)', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: {
          subtotalAmount: new Prisma.Decimal('0'),
          cgstAmount: new Prisma.Decimal('0'),
          sgstAmount: new Prisma.Decimal('0'),
          igstAmount: new Prisma.Decimal('0'),
          taxAmount: new Prisma.Decimal('0'),
        },
      });
      prisma.invoiceItem.groupBy.mockResolvedValue([]);

      await service.getGstSummary(hospitalWideUser, filters);

      const invoiceWhere = prisma.invoice.aggregate.mock.calls[0][0].where;
      expect(invoiceWhere.issuedAt).toEqual(
        expect.objectContaining({
          gte: new Date(filters.from),
          lt: new Date(filters.to),
        }),
      );
    });

    it('aggregates GST totals and HSN breakdown', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: {
          subtotalAmount: new Prisma.Decimal('1000.00'),
          cgstAmount: new Prisma.Decimal('90.00'),
          sgstAmount: new Prisma.Decimal('90.00'),
          igstAmount: new Prisma.Decimal('0.00'),
          taxAmount: new Prisma.Decimal('180.00'),
        },
      });
      prisma.invoiceItem.groupBy.mockResolvedValue([
        {
          hsnSac: '998311',
          _sum: {
            taxableAmount: new Prisma.Decimal('1000.00'),
            cgstAmount: new Prisma.Decimal('90.00'),
            sgstAmount: new Prisma.Decimal('90.00'),
            igstAmount: new Prisma.Decimal('0.00'),
          },
        },
      ]);

      const result = await service.getGstSummary(hospitalWideUser, filters);

      expect(result.summary.invoiceCount).toBe(1);
      expect(result.summary.taxableValue).toBe('1000.00');
      expect(result.summary.cgst).toBe('90.00');
      expect(result.summary.totalTax).toBe('180.00');
      expect(result.hsnBreakdown).toHaveLength(1);
      expect(result.hsnBreakdown[0].hsnSac).toBe('998311');
    });

    it('rejects unbounded HSN breakdown', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: {
          subtotalAmount: new Prisma.Decimal('1'),
          cgstAmount: new Prisma.Decimal('0'),
          sgstAmount: new Prisma.Decimal('0'),
          igstAmount: new Prisma.Decimal('0'),
          taxAmount: new Prisma.Decimal('0'),
        },
      });
      prisma.invoiceItem.groupBy.mockResolvedValue(
        Array.from({ length: MAX_HSN_BREAKDOWN_ROWS + 1 }, (_, i) => ({
          hsnSac: `HSN-${i}`,
          _sum: {
            taxableAmount: new Prisma.Decimal('1'),
            cgstAmount: new Prisma.Decimal('0'),
            sgstAmount: new Prisma.Decimal('0'),
            igstAmount: new Prisma.Decimal('0'),
          },
        })),
      );

      await expect(
        service.getGstSummary(hospitalWideUser, filters),
      ).rejects.toThrow(/HSN breakdown exceeds/);
    });
  });

  describe('exportReport', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      );
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { totalAmount: null },
      });
      prisma.payment.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { amount: null },
      });
      prisma.refund.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { amount: null },
      });
    });

    it('writes REPORT_EXPORTED with filter metadata only', async () => {
      const dto: ReportExportDto = {
        ...filters,
        type: ReportExportType.FINANCIAL,
        format: ReportExportFormat.JSON,
      };

      await service.exportReport(hospitalWideUser, dto);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REPORT_EXPORTED',
          entity: 'Report',
          metadata: expect.objectContaining({
            reportType: ReportExportType.FINANCIAL,
            format: ReportExportFormat.JSON,
            filterSummary: expect.objectContaining({ from: filters.from }),
            resultCount: 1,
          }),
        }),
      );

      const metadata = auditService.log.mock.calls[0][0].metadata;
      expect(metadata).not.toHaveProperty('invoiceTotal');
      expect(metadata).not.toHaveProperty('data');
    });

    it('returns CSV for financial export', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: { totalAmount: new Prisma.Decimal('500.00') },
      });

      const result = await service.exportReport(hospitalWideUser, {
        ...filters,
        type: ReportExportType.FINANCIAL,
        format: ReportExportFormat.CSV,
      });

      expect(result.type).toBe('csv');
      if (result.type === 'csv') {
        expect(result.body).toContain('netCollected');
        expect(result.filename).toMatch(/financial/);
      }
    });
  });

  describe('logReportViewed', () => {
    it('writes REPORT_VIEWED without report payload', async () => {
      await service.logReportViewed(hospitalWideUser, 'financial', filters);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REPORT_VIEWED',
          metadata: {
            reportType: 'financial',
            filterSummary: { from: filters.from, to: filters.to },
          },
        }),
      );
    });
  });
});
