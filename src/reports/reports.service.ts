import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InsuranceClaimStatus,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  ReportProjectionType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { roundMoney } from '../billing/utils/money.util';
import { InsuranceAgeingQueryDto } from './dto/insurance-ageing-query.dto';
import { ReportExportDto, ReportExportFormat, ReportExportType } from './dto/report-export.dto';
import { ReportDateRangeDto } from './dto/report-date-range.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary-query.dto';
import { ReportAsOfQueryDto } from './dto/report-as-of-query.dto';
import { buildDoctorPerformanceSummary } from './doctor-performance.util';
import {
  buildInsuranceAgeingSummary,
  isClaimOutstandingAsOf,
} from './insurance-ageing.util';
import { buildIpdOccupancySummary } from './ipd-occupancy.util';
import {
  REPORT_PROJECTION_MAX_AGE_MS,
  type ReportProjectionKey,
  ReportProjectionService,
} from './report-projection.service';
import { buildOpdMetricsSummary } from './opd-metrics.util';
import { assertValidReportDateRange, parseReportDate } from './report-date-range.util';
import {
  FinancialSummaryExportRow,
  GstSummaryExportRow,
  HsnBreakdownExportRow,
  serializeFinancialSummaryToCsv,
  serializeGstReportToCsv,
  serializePharmacyInventoryToCsv,
  serializePharmacySalesToCsv,
  serializePharmacyShrinkToCsv,
} from './report-export.util';
import {
  buildPharmacyInventorySummary,
  buildPharmacySalesSummary,
} from './pharmacy-reports.util';
import { buildPharmacyShrinkSummary } from './pharmacy-shrink.util';
import { buildDepartmentRevenueSummary } from './department-revenue.util';
import { buildPatientCohortSummary } from './patient-cohort.util';
import { buildAbdmAdoptionSummary } from './abdm-adoption.util';
import { deidentifyReportPayload } from './report-deidentification.util';
import { buildReportPdfInput } from './report-pdf.mapper';
import { renderReportPdf } from './report-pdf.util';
import {
  serializeAbdmAdoptionToCsv,
  serializeDepartmentRevenueToCsv,
  serializePatientCohortToCsv,
} from './report-export.util';
import { MAX_HSN_BREAKDOWN_ROWS, ReportAuthenticatedUser } from './reports.types';

export type FinancialSummaryResponse = {
  from: string;
  to: string;
  branchId: string | null;
  /** Accrual basis: ISSUED/PAID invoices with issuedAt in [from, to). */
  invoicesIssuedInRange: {
    count: number;
    totalAmount: string;
    timeBasis: 'issuedAt';
  };
  /** Cash basis: SUCCEEDED payments in [from, to) by paidAt or createdAt. */
  paymentsSucceededInRange: {
    count: number;
    totalAmount: string;
    timeBasis: 'paidAt|createdAt';
  };
  /** Cash basis: SUCCEEDED refunds in [from, to) by processedAt or createdAt. */
  refundsSucceededInRange: {
    count: number;
    totalAmount: string;
    timeBasis: 'processedAt|createdAt';
  };
  netCashCollected: string;
  /** @deprecated use invoicesIssuedInRange.count — kept for backward compatibility */
  invoiceCount: number;
  /** @deprecated use invoicesIssuedInRange.totalAmount */
  invoiceTotal: string;
  /** @deprecated use paymentsSucceededInRange.count */
  successfulPaymentCount: number;
  /** @deprecated use paymentsSucceededInRange.totalAmount */
  successfulPaymentTotal: string;
  /** @deprecated use refundsSucceededInRange.count */
  refundCount: number;
  /** @deprecated use refundsSucceededInRange.totalAmount */
  refundTotal: string;
  /** @deprecated use netCashCollected */
  netCollected: string;
};

export type GstSummaryBlock = {
  invoiceCount: number;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
};

export type HsnBreakdownItem = {
  hsnSac: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
};

export type GstSummaryResponse = {
  from: string;
  to: string;
  branchId: string | null;
  summary: GstSummaryBlock;
  hsnBreakdown: HsnBreakdownItem[];
};

export type ReportExportResult =
  | { type: 'csv'; body: string; filename: string }
  | { type: 'pdf'; body: Buffer; filename: string }
  | {
      type: 'json';
      body: {
        reportType: ReportExportType;
        from?: string;
        to?: string;
        asOf?: string;
        periodYear?: number;
        periodMonth?: number;
        branchId: string | null;
        data: FinancialSummaryResponse | GstSummaryResponse | Record<string, unknown>;
      };
    };

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly reportProjectionService: ReportProjectionService,
  ) {}

  private reportPeriod(from: string, to: string) {
    return { periodFrom: new Date(from), periodTo: new Date(to) };
  }

  private withReportProjection<T>(
    user: ReportAuthenticatedUser,
    key: Omit<ReportProjectionKey, 'hospitalId'>,
    compute: () => Promise<T>,
  ): Promise<T> {
    return this.reportProjectionService.getOrCompute(
      { hospitalId: user.hospitalId, ...key },
      REPORT_PROJECTION_MAX_AGE_MS,
      compute,
    );
  }

  async getFinancialSummary(
    user: ReportAuthenticatedUser,
    filters: ReportDateRangeDto,
  ): Promise<FinancialSummaryResponse> {
    assertValidReportDateRange(filters.from, filters.to);
    const scope = await this.resolveScope(user, filters);

    const [invoiceAgg, paymentAgg, refundAgg] = await this.prisma.$transaction([
      this.prisma.invoice.aggregate({
        where: scope.invoiceWhere,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: scope.paymentWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.refund.aggregate({
        where: scope.refundWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    const successfulPaymentTotal = roundMoney(
      paymentAgg._sum.amount ?? new Prisma.Decimal(0),
    );
    const refundTotal = roundMoney(refundAgg._sum.amount ?? new Prisma.Decimal(0));
    const netCashCollected = roundMoney(successfulPaymentTotal.sub(refundTotal));
    const invoiceTotal = this.formatMoney(invoiceAgg._sum.totalAmount);

    return {
      from: filters.from,
      to: filters.to,
      branchId: scope.effectiveBranchId,
      invoicesIssuedInRange: {
        count: invoiceAgg._count._all,
        totalAmount: invoiceTotal,
        timeBasis: 'issuedAt',
      },
      paymentsSucceededInRange: {
        count: paymentAgg._count._all,
        totalAmount: successfulPaymentTotal.toFixed(2),
        timeBasis: 'paidAt|createdAt',
      },
      refundsSucceededInRange: {
        count: refundAgg._count._all,
        totalAmount: refundTotal.toFixed(2),
        timeBasis: 'processedAt|createdAt',
      },
      netCashCollected: netCashCollected.toFixed(2),
      invoiceCount: invoiceAgg._count._all,
      invoiceTotal,
      successfulPaymentCount: paymentAgg._count._all,
      successfulPaymentTotal: successfulPaymentTotal.toFixed(2),
      refundCount: refundAgg._count._all,
      refundTotal: refundTotal.toFixed(2),
      netCollected: netCashCollected.toFixed(2),
    };
  }

  async getInsuranceClaimsAgeing(
    user: ReportAuthenticatedUser,
    filters: InsuranceAgeingQueryDto,
  ) {
    assertValidReportDateRange(filters.from, filters.to);

    const effectiveBranchId = await this.resolveReportBranchScope(user, filters.branchId);
    const { periodFrom, periodTo } = this.reportPeriod(filters.from, filters.to);
    const statusScope = filters.status ?? 'ALL';

    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.INSURANCE_AGEING,
        periodFrom,
        periodTo,
        scopeKey: statusScope,
      },
      () => this.computeInsuranceClaimsAgeing(user, filters, effectiveBranchId),
    );
  }

  private async computeInsuranceClaimsAgeing(
    user: ReportAuthenticatedUser,
    filters: InsuranceAgeingQueryDto,
    effectiveBranchId: string | null,
  ) {
    const asOf = new Date(filters.to);

    const where: Prisma.InsuranceClaimWhereInput = {
      hospitalId: user.hospitalId,
      createdAt: { lt: asOf },
    };

    if (effectiveBranchId) {
      where.branchId = effectiveBranchId;
    }

    if (filters.status) {
      where.status = filters.status;
    } else {
      where.status = {
        notIn: [InsuranceClaimStatus.CANCELLED, InsuranceClaimStatus.DRAFT],
      };
    }

    const claimRows = await this.prisma.insuranceClaim.findMany({
      where,
      select: {
        id: true,
        status: true,
        claimedAmount: true,
        approvedAmount: true,
        paidAmount: true,
        submittedAt: true,
        createdAt: true,
        paidAt: true,
        rejectedAt: true,
      },
    });

    const claims = claimRows.filter((claim) => isClaimOutstandingAsOf(claim, asOf));

    const summary = buildInsuranceAgeingSummary(claims, asOf);

    return {
      from: filters.from,
      to: filters.to,
      branchId: effectiveBranchId,
      status: filters.status ?? null,
      asOf: filters.to,
      ageingTimeBasis:
        'Claims outstanding as of `to`; not filtered by submission window',
      ...summary,
    };
  }

  async getGstSummary(
    user: ReportAuthenticatedUser,
    filters: ReportDateRangeDto,
  ): Promise<GstSummaryResponse> {
    assertValidReportDateRange(filters.from, filters.to);
    const scope = await this.resolveScope(user, filters);
    const { periodFrom, periodTo } = this.reportPeriod(filters.from, filters.to);
    return this.withReportProjection(
      user,
      {
        branchId: scope.effectiveBranchId,
        reportType: ReportProjectionType.GST_SUMMARY,
        periodFrom,
        periodTo,
      },
      () => this.computeGstSummary(user, filters, scope),
    );
  }

  private async computeGstSummary(
    user: ReportAuthenticatedUser,
    filters: ReportDateRangeDto,
    scope: Awaited<ReturnType<ReportsService['resolveScope']>>,
  ): Promise<GstSummaryResponse> {

    const invoiceAgg = await this.prisma.invoice.aggregate({
      where: scope.invoiceWhere,
      _count: { _all: true },
      _sum: {
        subtotalAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        taxAmount: true,
      },
    });

    const hsnGroups = await this.prisma.invoiceItem.groupBy({
      by: ['hsnSac'],
      where: {
        hospitalId: user.hospitalId,
        invoice: scope.invoiceRelationFilter,
      },
      _sum: {
        taxableAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
      },
      orderBy: { hsnSac: 'asc' },
    });

    if (hsnGroups.length > MAX_HSN_BREAKDOWN_ROWS) {
      throw new BadRequestException(
        `HSN breakdown exceeds the maximum of ${MAX_HSN_BREAKDOWN_ROWS} rows (${hsnGroups.length}). Narrow your filters.`,
      );
    }

    const hsnBreakdown = hsnGroups.map((row) =>
      this.toHsnBreakdownItem(row.hsnSac, row._sum),
    );

    const cgst = roundMoney(invoiceAgg._sum.cgstAmount ?? new Prisma.Decimal(0));
    const sgst = roundMoney(invoiceAgg._sum.sgstAmount ?? new Prisma.Decimal(0));
    const igst = roundMoney(invoiceAgg._sum.igstAmount ?? new Prisma.Decimal(0));
    const totalTax = roundMoney(invoiceAgg._sum.taxAmount ?? new Prisma.Decimal(0));

    return {
      from: filters.from,
      to: filters.to,
      branchId: scope.effectiveBranchId,
      summary: {
        invoiceCount: invoiceAgg._count._all,
        taxableValue: this.formatMoney(invoiceAgg._sum.subtotalAmount),
        cgst: cgst.toFixed(2),
        sgst: sgst.toFixed(2),
        igst: igst.toFixed(2),
        totalTax: totalTax.toFixed(2),
      },
      hsnBreakdown,
    };
  }

  async getPharmacySalesSummary(
    user: ReportAuthenticatedUser,
    filters: ReportDateRangeDto,
  ) {
    assertValidReportDateRange(filters.from, filters.to);
    const scope = await this.resolveScope(user, filters);
    return buildPharmacySalesSummary(this.prisma, {
      hospitalId: user.hospitalId,
      branchId: scope.effectiveBranchId,
      from: filters.from,
      to: filters.to,
    });
  }

  async getPharmacyInventorySummary(
    user: ReportAuthenticatedUser,
    filters: ReportDateRangeDto,
  ) {
    assertValidReportDateRange(filters.from, filters.to);
    const scope = await this.resolveScope(user, filters);
    return buildPharmacyInventorySummary(this.prisma, {
      hospitalId: user.hospitalId,
      branchId: scope.effectiveBranchId,
      from: filters.from,
      to: filters.to,
    });
  }

  async getPharmacyShrinkSummary(
    user: ReportAuthenticatedUser,
    filters: ReportDateRangeDto,
  ) {
    assertValidReportDateRange(filters.from, filters.to);
    const effectiveBranchId = await this.resolveReportBranchScope(user, filters.branchId);
    const { periodFrom, periodTo } = this.reportPeriod(filters.from, filters.to);
    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.PHARMACY_SHRINK,
        periodFrom,
        periodTo,
      },
      () =>
        buildPharmacyShrinkSummary(this.prisma, {
          hospitalId: user.hospitalId,
          branchId: effectiveBranchId,
          from: filters.from,
          to: filters.to,
        }),
    );
  }

  async getOpdMetrics(user: ReportAuthenticatedUser, filters: ReportDateRangeDto) {
    assertValidReportDateRange(filters.from, filters.to);
    const effectiveBranchId = await this.resolveReportBranchScope(user, filters.branchId);
    const { periodFrom, periodTo } = this.reportPeriod(filters.from, filters.to);
    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.OPD_METRICS,
        periodFrom,
        periodTo,
      },
      () =>
        buildOpdMetricsSummary(this.prisma, {
          hospitalId: user.hospitalId,
          branchId: effectiveBranchId,
          from: filters.from,
          to: filters.to,
        }),
    );
  }

  async getIpdOccupancy(user: ReportAuthenticatedUser, query: ReportAsOfQueryDto) {
    parseReportDate(query.asOf, 'asOf');
    const effectiveBranchId = await this.resolveReportBranchScope(user, query.branchId);
    const asOfDate = new Date(query.asOf);
    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.IPD_OCCUPANCY,
        periodFrom: asOfDate,
        periodTo: asOfDate,
        scopeKey: query.asOf,
      },
      () =>
        buildIpdOccupancySummary(this.prisma, {
          hospitalId: user.hospitalId,
          branchId: effectiveBranchId,
          asOf: query.asOf,
        }),
    );
  }

  async getDoctorPerformance(user: ReportAuthenticatedUser, filters: ReportDateRangeDto) {
    assertValidReportDateRange(filters.from, filters.to);
    const effectiveBranchId = await this.resolveReportBranchScope(user, filters.branchId);
    const { periodFrom, periodTo } = this.reportPeriod(filters.from, filters.to);
    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.DOCTOR_PERFORMANCE,
        periodFrom,
        periodTo,
      },
      () =>
        buildDoctorPerformanceSummary(this.prisma, {
          hospitalId: user.hospitalId,
          branchId: effectiveBranchId,
          from: filters.from,
          to: filters.to,
        }),
    );
  }

  async getAttendanceSummary(
    user: ReportAuthenticatedUser,
    query: AttendanceSummaryQueryDto,
  ) {
    const effectiveBranchId = await this.resolveReportBranchScope(user, query.branchId);
    const periodFrom = new Date(Date.UTC(query.periodYear, query.periodMonth - 1, 1));
    const periodTo = new Date(Date.UTC(query.periodYear, query.periodMonth, 1));

    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.ATTENDANCE_SUMMARY,
        periodFrom,
        periodTo,
        scopeKey: `${query.periodYear}-${query.periodMonth}`,
      },
      () => this.computeAttendanceSummary(user, query, effectiveBranchId),
    );
  }

  private async computeAttendanceSummary(
    user: ReportAuthenticatedUser,
    query: AttendanceSummaryQueryDto,
    effectiveBranchId: string | null,
  ) {
    const whereInput: Prisma.AttendanceMonthlySummaryWhereInput = {
      hospitalId: user.hospitalId,
      periodYear: query.periodYear,
      periodMonth: query.periodMonth,
    };

    if (user.branchId == null && query.branchId !== undefined) {
      whereInput.branchId = query.branchId;
    }

    const where = applyBranchScope(user, whereInput);

    const summaries = await this.prisma.attendanceMonthlySummary.findMany({
      where,
      select: {
        presentDays: true,
        lateDays: true,
        halfDayDays: true,
        absentDays: true,
        totalLateMinutes: true,
        totalEarlyLeaveMinutes: true,
      },
    });

    let presentDays = 0;
    let lateDays = 0;
    let halfDayDays = 0;
    let absentDays = 0;
    let totalLateMinutes = 0;
    let totalEarlyLeaveMinutes = 0;

    for (const row of summaries) {
      presentDays += row.presentDays;
      lateDays += row.lateDays;
      halfDayDays += row.halfDayDays;
      absentDays += row.absentDays;
      totalLateMinutes += row.totalLateMinutes;
      totalEarlyLeaveMinutes += row.totalEarlyLeaveMinutes;
    }

    return {
      periodYear: query.periodYear,
      periodMonth: query.periodMonth,
      branchId: effectiveBranchId,
      timeBasis: 'AttendanceMonthlySummary calendar month',
      staffCount: summaries.length,
      presentDays,
      lateDays,
      halfDayDays,
      absentDays,
      totalLateMinutes,
      totalEarlyLeaveMinutes,
    };
  }

  async getDepartmentRevenue(user: ReportAuthenticatedUser, filters: ReportDateRangeDto) {
    assertValidReportDateRange(filters.from, filters.to);
    const effectiveBranchId = await this.resolveReportBranchScope(user, filters.branchId);
    const { periodFrom, periodTo } = this.reportPeriod(filters.from, filters.to);
    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.DEPARTMENT_REVENUE,
        periodFrom,
        periodTo,
      },
      () =>
        buildDepartmentRevenueSummary(this.prisma, {
          hospitalId: user.hospitalId,
          branchId: effectiveBranchId,
          from: filters.from,
          to: filters.to,
        }),
    );
  }

  async getPatientCohort(user: ReportAuthenticatedUser, filters: ReportDateRangeDto) {
    assertValidReportDateRange(filters.from, filters.to);
    const effectiveBranchId = await this.resolveReportBranchScope(user, filters.branchId);
    const { periodFrom, periodTo } = this.reportPeriod(filters.from, filters.to);
    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.PATIENT_COHORT,
        periodFrom,
        periodTo,
      },
      async () => {
        const summary = await buildPatientCohortSummary(this.prisma, {
          hospitalId: user.hospitalId,
          branchId: effectiveBranchId,
          from: filters.from,
          to: filters.to,
        });
        return deidentifyReportPayload(summary) as typeof summary;
      },
    );
  }

  async getAbdmAdoption(user: ReportAuthenticatedUser, filters: ReportDateRangeDto) {
    assertValidReportDateRange(filters.from, filters.to);
    const effectiveBranchId = await this.resolveReportBranchScope(user, filters.branchId);
    const { periodFrom, periodTo } = this.reportPeriod(filters.from, filters.to);
    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.ABDM_ADOPTION,
        periodFrom,
        periodTo,
      },
      async () => {
        const summary = await buildAbdmAdoptionSummary(this.prisma, {
          hospitalId: user.hospitalId,
          branchId: effectiveBranchId,
          from: filters.from,
          to: filters.to,
        });
        return deidentifyReportPayload(summary) as typeof summary;
      },
    );
  }

  async getDailyDashboard(user: ReportAuthenticatedUser, filters: ReportDateRangeDto) {
    assertValidReportDateRange(filters.from, filters.to);
    const effectiveBranchId = await this.resolveReportBranchScope(user, filters.branchId);
    const { periodFrom, periodTo } = this.reportPeriod(filters.from, filters.to);

    return this.withReportProjection(
      user,
      {
        branchId: effectiveBranchId,
        reportType: ReportProjectionType.DAILY_DASHBOARD,
        periodFrom,
        periodTo,
      },
      () => this.computeDailyDashboard(user, filters, effectiveBranchId),
    );
  }

  private async computeDailyDashboard(
    user: ReportAuthenticatedUser,
    filters: ReportDateRangeDto,
    effectiveBranchId: string | null,
  ) {
    const from = new Date(filters.from);
    const to = new Date(filters.to);

    const appointmentBase: Prisma.AppointmentWhereInput = {
      hospitalId: user.hospitalId,
      startAt: { gte: from, lt: to },
    };
    if (user.branchId == null && effectiveBranchId) {
      appointmentBase.branchId = effectiveBranchId;
    }
    const appointmentScope = applyBranchScope(user, appointmentBase);

    const [financial, opd, pharmacy, ipd, appointmentTotal] = await Promise.all([
      this.getFinancialSummary(user, filters),
      this.getOpdMetrics(user, filters),
      this.getPharmacySalesSummary(user, filters),
      this.getIpdOccupancy(user, { asOf: filters.to, branchId: filters.branchId }),
      this.prisma.appointment.count({ where: appointmentScope }),
    ]);

    return {
      dateRange: {
        from: filters.from,
        to: filters.to,
        branchId: effectiveBranchId,
      },
      financial,
      appointments: {
        timeBasis: 'Appointment.startAt',
        totalScheduled: appointmentTotal,
      },
      opd,
      ipd,
      pharmacy,
    };
  }

  async exportReport(
    user: ReportAuthenticatedUser,
    dto: ReportExportDto,
  ): Promise<ReportExportResult> {
    assertValidReportDateRange(dto.from, dto.to);

    let result: ReportExportResult;
    let rowCount: number;

    if (dto.type === ReportExportType.INSURANCE_AGEING) {
      const ageing = await this.getInsuranceClaimsAgeing(user, dto);
      rowCount = ageing.buckets.length + 1;
      if (dto.format === ReportExportFormat.CSV) {
        const header =
          'bucket,claimCount,claimedAmount,approvedAmount,paidAmount,outstandingAmount\n';
        const lines = ageing.buckets
          .map(
            (b) =>
              `${b.label},${b.claimCount},${b.claimedAmount},${b.approvedAmount},${b.paidAmount},${b.outstandingAmount}`,
          )
          .join('\n');
        result = {
          type: 'csv',
          body: `${header}${lines}`,
          filename: this.buildFilename('insurance-ageing', 'csv'),
        };
      } else if (dto.format === ReportExportFormat.PDF) {
        result = await this.buildPdfExport(
          dto,
          ageing,
          'insurance-ageing',
          ageing.branchId,
        );
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.INSURANCE_AGEING,
            from: dto.from,
            to: dto.to,
            branchId: ageing.branchId,
            data: ageing,
          },
        };
      }
    } else if (dto.type === ReportExportType.PHARMACY_SHRINK) {
      const summary = await this.getPharmacyShrinkSummary(user, dto);
      rowCount = summary.byMovementType.length + 1;
      if (dto.format === ReportExportFormat.CSV) {
        result = {
          type: 'csv',
          body: serializePharmacyShrinkToCsv(
            summary.byMovementType.map((row) => ({
              movementType: row.movementType,
              quantity: row.quantity,
            })),
            summary.totalShrinkQuantity,
          ),
          filename: this.buildFilename('pharmacy-shrink', 'csv'),
        };
      } else if (dto.format === ReportExportFormat.PDF) {
        result = await this.buildPdfExport(dto, summary, 'pharmacy-shrink', summary.branchId);
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.PHARMACY_SHRINK,
            from: dto.from,
            to: dto.to,
            branchId: summary.branchId,
            data: deidentifyReportPayload(summary) as Record<string, unknown>,
          },
        };
      }
    } else if (dto.type === ReportExportType.PHARMACY_SALES) {
      const summary = await this.getPharmacySalesSummary(user, dto);
      rowCount = 1;
      if (dto.format === ReportExportFormat.CSV) {
        result = {
          type: 'csv',
          body: serializePharmacySalesToCsv({
            dispensingCount: summary.dispensingCount,
            lineCount: summary.lineCount,
            totalQuantity: summary.totalQuantity,
            grossSales: summary.grossSales,
          }),
          filename: this.buildFilename('pharmacy-sales', 'csv'),
        };
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.PHARMACY_SALES,
            from: dto.from,
            to: dto.to,
            branchId: summary.branchId,
            data: summary,
          },
        };
      }
    } else if (dto.type === ReportExportType.PHARMACY_INVENTORY) {
      const summary = await this.getPharmacyInventorySummary(user, dto);
      rowCount = 1;
      if (dto.format === ReportExportFormat.CSV) {
        result = {
          type: 'csv',
          body: serializePharmacyInventoryToCsv({
            activeProductCount: summary.activeProductCount,
            totalOnHandQuantity: summary.totalOnHandQuantity,
            lowStockProductCount: summary.lowStockProductCount,
            expiredBatchCount: summary.expiredBatchCount,
            expiringWithin30DaysBatchCount: summary.expiringWithin30DaysBatchCount,
            shrinkageQuantity: summary.shrinkageQuantity,
          }),
          filename: this.buildFilename('pharmacy-inventory', 'csv'),
        };
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.PHARMACY_INVENTORY,
            from: dto.from,
            to: dto.to,
            branchId: summary.branchId,
            data: summary,
          },
        };
      }
    } else if (dto.type === ReportExportType.FINANCIAL) {
      const summary = await this.getFinancialSummary(user, dto);
      rowCount = 1;
      if (dto.format === ReportExportFormat.CSV) {
        const row: FinancialSummaryExportRow = {
          invoiceCount: summary.invoiceCount,
          invoiceTotal: summary.invoiceTotal,
          successfulPaymentCount: summary.successfulPaymentCount,
          successfulPaymentTotal: summary.successfulPaymentTotal,
          refundCount: summary.refundCount,
          refundTotal: summary.refundTotal,
          netCollected: summary.netCashCollected,
        };
        result = {
          type: 'csv',
          body: serializeFinancialSummaryToCsv(row),
          filename: this.buildFilename('financial', 'csv'),
        };
      } else if (dto.format === ReportExportFormat.PDF) {
        result = await this.buildPdfExport(dto, summary, 'financial', summary.branchId);
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.FINANCIAL,
            from: dto.from,
            to: dto.to,
            branchId: summary.branchId,
            data: deidentifyReportPayload(summary) as FinancialSummaryResponse,
          },
        };
      }
    } else if (dto.type === ReportExportType.OPD_METRICS) {
      const summary = await this.getOpdMetrics(user, dto);
      rowCount = 3;
      if (dto.format === ReportExportFormat.PDF) {
        result = await this.buildPdfExport(dto, summary, 'opd-metrics', summary.branchId);
      } else if (dto.format === ReportExportFormat.CSV) {
        result = {
          type: 'csv',
          body: serializePharmacySalesToCsv({
            queueTotal: summary.queue.totalEntries,
            appointmentsTotal: summary.appointments.totalScheduled,
            opdCompleted: summary.encounters.opdCompleted,
          }),
          filename: this.buildFilename('opd-metrics', 'csv'),
        };
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.OPD_METRICS,
            from: dto.from,
            to: dto.to,
            branchId: summary.branchId,
            data: deidentifyReportPayload(summary) as Record<string, unknown>,
          },
        };
      }
    } else if (dto.type === ReportExportType.DEPARTMENT_REVENUE) {
      const summary = await this.getDepartmentRevenue(user, dto);
      rowCount = summary.departments.length + 1;
      if (dto.format === ReportExportFormat.CSV) {
        result = {
          type: 'csv',
          body: serializeDepartmentRevenueToCsv(summary.departments, summary.totals),
          filename: this.buildFilename('department-revenue', 'csv'),
        };
      } else if (dto.format === ReportExportFormat.PDF) {
        result = await this.buildPdfExport(dto, summary, 'department-revenue', summary.branchId);
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.DEPARTMENT_REVENUE,
            from: dto.from,
            to: dto.to,
            branchId: summary.branchId,
            data: deidentifyReportPayload(summary) as Record<string, unknown>,
          },
        };
      }
    } else if (dto.type === ReportExportType.PATIENT_COHORT) {
      const summary = await this.getPatientCohort(user, dto);
      rowCount = summary.byRegistrationMonth.length + 1;
      if (dto.format === ReportExportFormat.CSV) {
        result = {
          type: 'csv',
          body: serializePatientCohortToCsv(summary),
          filename: this.buildFilename('patient-cohort', 'csv'),
        };
      } else if (dto.format === ReportExportFormat.PDF) {
        result = await this.buildPdfExport(dto, summary, 'patient-cohort', summary.branchId);
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.PATIENT_COHORT,
            from: dto.from,
            to: dto.to,
            branchId: summary.branchId,
            data: summary,
          },
        };
      }
    } else if (dto.type === ReportExportType.DAILY_DASHBOARD) {
      const summary = await this.getDailyDashboard(user, dto);
      rowCount = 1;
      result =
        dto.format === ReportExportFormat.PDF
          ? await this.buildPdfExport(dto, summary, 'daily-dashboard', summary.dateRange.branchId)
          : {
              type: 'json',
              body: {
                reportType: ReportExportType.DAILY_DASHBOARD,
                from: dto.from,
                to: dto.to,
                branchId: summary.dateRange.branchId,
                data: deidentifyReportPayload(summary) as Record<string, unknown>,
              },
            };
    } else if (dto.type === ReportExportType.IPD_OCCUPANCY) {
      if (!dto.asOf) {
        throw new BadRequestException('asOf is required for ipd_occupancy export');
      }
      const summary = await this.getIpdOccupancy(user, {
        asOf: dto.asOf,
        branchId: dto.branchId,
      });
      rowCount = 1;
      result =
        dto.format === ReportExportFormat.PDF
          ? await this.buildPdfExport(dto, summary, 'ipd-occupancy', summary.branchId)
          : {
              type: 'json',
              body: {
                reportType: ReportExportType.IPD_OCCUPANCY,
                asOf: dto.asOf,
                branchId: summary.branchId,
                data: summary,
              },
            };
    } else if (dto.type === ReportExportType.DOCTOR_PERFORMANCE) {
      const summary = await this.getDoctorPerformance(user, dto);
      rowCount = summary.doctors.length + 1;
      result =
        dto.format === ReportExportFormat.PDF
          ? await this.buildPdfExport(dto, summary, 'doctor-performance', summary.branchId)
          : {
              type: 'json',
              body: {
                reportType: ReportExportType.DOCTOR_PERFORMANCE,
                from: dto.from,
                to: dto.to,
                branchId: summary.branchId,
                data: deidentifyReportPayload(summary) as Record<string, unknown>,
              },
            };
    } else if (dto.type === ReportExportType.ATTENDANCE_SUMMARY) {
      if (dto.periodYear == null || dto.periodMonth == null) {
        throw new BadRequestException(
          'periodYear and periodMonth are required for attendance_summary export',
        );
      }
      const summary = await this.getAttendanceSummary(user, {
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        branchId: dto.branchId,
      });
      rowCount = 1;
      if (dto.format === ReportExportFormat.PDF) {
        result = await this.buildPdfExport(
          dto,
          summary,
          'attendance-summary',
          summary.branchId,
        );
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.ATTENDANCE_SUMMARY,
            periodYear: dto.periodYear,
            periodMonth: dto.periodMonth,
            branchId: summary.branchId,
            data: summary,
          },
        };
      }
    } else if (dto.type === ReportExportType.ABDM_ADOPTION) {
      const summary = await this.getAbdmAdoption(user, dto);
      rowCount = summary.consents.byStatus.length + 1;
      if (dto.format === ReportExportFormat.CSV) {
        result = {
          type: 'csv',
          body: serializeAbdmAdoptionToCsv(summary),
          filename: this.buildFilename('abdm-adoption', 'csv'),
        };
      } else if (dto.format === ReportExportFormat.PDF) {
        result = await this.buildPdfExport(dto, summary, 'abdm-adoption', summary.branchId);
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.ABDM_ADOPTION,
            from: dto.from,
            to: dto.to,
            branchId: summary.branchId,
            data: summary,
          },
        };
      }
    } else {
      const gst = await this.getGstSummary(user, dto);
      rowCount = 1 + gst.hsnBreakdown.length;
      if (dto.format === ReportExportFormat.CSV) {
        const summaryRow: GstSummaryExportRow = {
          invoiceCount: gst.summary.invoiceCount,
          taxableValue: gst.summary.taxableValue,
          cgst: gst.summary.cgst,
          sgst: gst.summary.sgst,
          igst: gst.summary.igst,
          totalTax: gst.summary.totalTax,
        };
        const hsnRows: HsnBreakdownExportRow[] = gst.hsnBreakdown.map((h) => ({
          hsnSac: h.hsnSac,
          taxableValue: h.taxableValue,
          cgst: h.cgst,
          sgst: h.sgst,
          igst: h.igst,
          totalTax: h.totalTax,
        }));
        result = {
          type: 'csv',
          body: serializeGstReportToCsv(summaryRow, hsnRows),
          filename: this.buildFilename('gst', 'csv'),
        };
      } else if (dto.format === ReportExportFormat.PDF) {
        result = await this.buildPdfExport(dto, gst, 'gst', gst.branchId);
      } else {
        result = {
          type: 'json',
          body: {
            reportType: ReportExportType.GST,
            from: dto.from,
            to: dto.to,
            branchId: gst.branchId,
            data: gst,
          },
        };
      }
    }

    await this.auditService.log({
      action: 'REPORT_EXPORTED',
      entity: 'Report',
      entityId: null,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? dto.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        reportType: dto.type,
        format: dto.format,
        filterSummary: this.buildFilterSummary(dto),
        resultCount: rowCount,
      },
    });

    return result;
  }

  async logReportViewed(
    user: ReportAuthenticatedUser,
    reportType:
      | 'financial'
      | 'gst'
      | 'insurance_ageing'
      | 'pharmacy_sales'
      | 'pharmacy_inventory'
      | 'pharmacy_shrink'
      | 'dashboard_daily'
      | 'opd_metrics'
      | 'ipd_occupancy'
      | 'doctor_performance'
      | 'attendance_summary'
      | 'department_revenue'
      | 'patient_cohort'
      | 'abdm_adoption',
    filters: ReportDateRangeDto,
  ): Promise<void> {
    await this.auditService.log({
      action: 'REPORT_VIEWED',
      entity: 'Report',
      entityId: null,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? filters.branchId ?? undefined,
      userId: user.sub,
      metadata: {
        reportType,
        filterSummary: this.buildFilterSummary(filters),
      },
    });
  }

  private buildFilterSummary(
    filters: ReportDateRangeDto,
  ): Record<string, string> {
    const summary: Record<string, string> = {
      from: filters.from,
      to: filters.to,
    };
    if (filters.branchId !== undefined) {
      summary.branchId = filters.branchId;
    }
    return summary;
  }

  private buildFilename(prefix: string, ext: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `medios-report-${prefix}-${stamp}.${ext}`;
  }

  private async buildPdfExport(
    dto: ReportExportDto,
    data: unknown,
    filenamePrefix: string,
    branchId: string | null,
  ): Promise<ReportExportResult> {
    const safe = deidentifyReportPayload(data) as Record<string, unknown>;
    const pdfInput = buildReportPdfInput(dto.type, safe, {
      from: dto.from,
      to: dto.to,
      branchId,
      generatedAt: new Date().toISOString(),
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
      asOf: dto.asOf,
    });
    const body = await renderReportPdf(pdfInput);
    return {
      type: 'pdf',
      body,
      filename: this.buildFilename(filenamePrefix, 'pdf'),
    };
  }

  private formatMoney(value: Prisma.Decimal | null | undefined): string {
    return roundMoney(value ?? new Prisma.Decimal(0)).toFixed(2);
  }

  private toHsnBreakdownItem(
    hsnSac: string | null,
    sums: {
      taxableAmount: Prisma.Decimal | null;
      cgstAmount: Prisma.Decimal | null;
      sgstAmount: Prisma.Decimal | null;
      igstAmount: Prisma.Decimal | null;
    },
  ): HsnBreakdownItem {
    const cgst = roundMoney(sums.cgstAmount ?? new Prisma.Decimal(0));
    const sgst = roundMoney(sums.sgstAmount ?? new Prisma.Decimal(0));
    const igst = roundMoney(sums.igstAmount ?? new Prisma.Decimal(0));
    const totalTax = roundMoney(cgst.add(sgst).add(igst));

    return {
      hsnSac: hsnSac?.trim() ? hsnSac : 'UNSPECIFIED',
      taxableValue: this.formatMoney(sums.taxableAmount),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      totalTax: totalTax.toFixed(2),
    };
  }

  private issuedAtWindow(from: string, to: string): Prisma.DateTimeFilter {
    return {
      gte: new Date(from),
      lt: new Date(to),
    };
  }

  private paymentActivityWindow(from: string, to: string): Prisma.PaymentWhereInput {
    const gte = new Date(from);
    const lt = new Date(to);
    return {
      OR: [
        { paidAt: { gte, lt } },
        {
          paidAt: null,
          createdAt: { gte, lt },
        },
      ],
    };
  }

  private refundActivityWindow(from: string, to: string): Prisma.RefundWhereInput {
    const gte = new Date(from);
    const lt = new Date(to);
    return {
      OR: [
        { processedAt: { gte, lt } },
        {
          processedAt: null,
          createdAt: { gte, lt },
        },
      ],
    };
  }

  private async resolveReportBranchScope(
    user: ReportAuthenticatedUser,
    branchId?: string,
  ): Promise<string | null> {
    if (user.branchId != null && branchId !== undefined) {
      assertBranchAccess(user, branchId);
    }

    if (user.branchId == null && branchId !== undefined) {
      await this.validateBranch(user, branchId);
    }

    return user.branchId ?? branchId ?? null;
  }

  private async validateBranch(
    user: ReportAuthenticatedUser,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Branch does not belong to your hospital');
    }
  }

  private async resolveScope(
    user: ReportAuthenticatedUser,
    filters: ReportDateRangeDto,
  ): Promise<{
    effectiveBranchId: string | null;
    invoiceWhere: Prisma.InvoiceWhereInput;
    invoiceRelationFilter: Prisma.InvoiceWhereInput;
    paymentWhere: Prisma.PaymentWhereInput;
    refundWhere: Prisma.RefundWhereInput;
  }> {
    if (user.branchId != null && filters.branchId !== undefined) {
      assertBranchAccess(user, filters.branchId);
    }

    if (user.branchId == null && filters.branchId !== undefined) {
      await this.validateBranch(user, filters.branchId);
    }

    const invoiceBase: Prisma.InvoiceWhereInput = {
      hospitalId: user.hospitalId,
      status: {
        in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID],
      },
      issuedAt: this.issuedAtWindow(filters.from, filters.to),
    };

    if (user.branchId == null && filters.branchId !== undefined) {
      invoiceBase.branchId = filters.branchId;
    }

    const invoiceWhere = applyBranchScope(user, invoiceBase);

    const paymentBase: Prisma.PaymentWhereInput = {
      hospitalId: user.hospitalId,
      status: PaymentStatus.SUCCEEDED,
      ...this.paymentActivityWindow(filters.from, filters.to),
    };

    if (user.branchId == null && filters.branchId !== undefined) {
      paymentBase.branchId = filters.branchId;
    }

    const paymentWhere = applyBranchScope(user, paymentBase);

    const refundBase: Prisma.RefundWhereInput = {
      hospitalId: user.hospitalId,
      status: RefundStatus.SUCCEEDED,
      ...this.refundActivityWindow(filters.from, filters.to),
    };

    if (user.branchId == null && filters.branchId !== undefined) {
      refundBase.branchId = filters.branchId;
    }

    const refundWhere = applyBranchScope(user, refundBase);

    const effectiveBranchId =
      user.branchId ?? filters.branchId ?? null;

    return {
      effectiveBranchId,
      invoiceWhere,
      invoiceRelationFilter: invoiceWhere,
      paymentWhere,
      refundWhere,
    };
  }

  /** Worker job: materialize a billing-related projection row for subsequent fast reads. */
  async materializeProjectionForRefreshJob(input: {
    hospitalId: string;
    branchId: string | null;
    reportType: ReportProjectionType;
    periodFrom: Date;
    periodTo: Date;
  }): Promise<void> {
    const user: ReportAuthenticatedUser = {
      sub: 'report-projection-refresh',
      hospitalId: input.hospitalId,
      branchId: input.branchId,
    };
    const from = input.periodFrom.toISOString().slice(0, 10);
    const to = input.periodTo.toISOString().slice(0, 10);
    const filters: ReportDateRangeDto = {
      from,
      to,
      ...(input.branchId ? { branchId: input.branchId } : {}),
    };

    switch (input.reportType) {
      case ReportProjectionType.GST_SUMMARY:
        await this.getGstSummary(user, filters);
        break;
      case ReportProjectionType.DAILY_DASHBOARD:
        await this.getDailyDashboard(user, filters);
        break;
      case ReportProjectionType.DEPARTMENT_REVENUE:
        await this.getDepartmentRevenue(user, filters);
        break;
      default:
        break;
    }
  }
}
