import { ReportExportType } from './dto/report-export.dto';
import { buildReportPdfInput } from './report-pdf.mapper';
import { renderReportPdf } from './report-pdf.util';

const meta = {
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-02-01T00:00:00.000Z',
  branchId: 'branch-1',
  generatedAt: '2026-01-15T12:00:00.000Z',
};

const ELEVEN_DOMAIN_REPORT_TYPES: ReportExportType[] = [
  ReportExportType.DAILY_DASHBOARD,
  ReportExportType.OPD_METRICS,
  ReportExportType.IPD_OCCUPANCY,
  ReportExportType.DEPARTMENT_REVENUE,
  ReportExportType.DOCTOR_PERFORMANCE,
  ReportExportType.PATIENT_COHORT,
  ReportExportType.GST,
  ReportExportType.ATTENDANCE_SUMMARY,
  ReportExportType.PHARMACY_SHRINK,
  ReportExportType.INSURANCE_AGEING,
  ReportExportType.ABDM_ADOPTION,
];

describe('buildReportPdfInput (11 domain reports)', () => {
  it.each(ELEVEN_DOMAIN_REPORT_TYPES)(
    'builds non-empty tables for %s',
    async (reportType) => {
      const data = samplePayload(reportType);
      const input = buildReportPdfInput(reportType, data, {
        ...meta,
        ...(reportType === ReportExportType.ATTENDANCE_SUMMARY
          ? { periodYear: 2026, periodMonth: 1 }
          : {}),
        ...(reportType === ReportExportType.IPD_OCCUPANCY
          ? { asOf: '2026-01-31T00:00:00.000Z' }
          : {}),
      });

      expect(input.tables.length).toBeGreaterThan(0);
      expect(input.tables.some((t) => t.rows.length > 0)).toBe(true);

      const pdf = await renderReportPdf(input);
      expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(pdf.length).toBeGreaterThan(100);
    },
  );
});

function samplePayload(type: ReportExportType): Record<string, unknown> {
  switch (type) {
    case ReportExportType.DAILY_DASHBOARD:
      return { billing: { invoicesIssued: 2 }, clinical: { encounters: 5 } };
    case ReportExportType.OPD_METRICS:
      return { queue: { totalEntries: 3 }, appointments: { totalScheduled: 4 } };
    case ReportExportType.IPD_OCCUPANCY:
      return { totalBeds: 10, occupiedBeds: 7, occupancyPercent: '70' };
    case ReportExportType.DEPARTMENT_REVENUE:
      return {
        departments: [{ department: 'OPD', lineCount: 1, revenue: '100.00' }],
        totals: { lineCount: 1, revenue: '100.00' },
      };
    case ReportExportType.DOCTOR_PERFORMANCE:
      return {
        doctors: [{ doctorLabel: 'Dr A', encounterCount: 2, revenue: '200.00' }],
      };
    case ReportExportType.PATIENT_COHORT:
      return { totals: { activePatients: 10, newPatients: 2 } };
    case ReportExportType.GST:
      return {
        summary: {
          invoiceCount: 1,
          taxableValue: '1000',
          cgst: '90',
          sgst: '90',
          igst: '0',
          totalTax: '180',
        },
        hsnBreakdown: [{ hsnSac: '3004', taxableValue: '1000', totalTax: '180' }],
      };
    case ReportExportType.ATTENDANCE_SUMMARY:
      return { totals: { presentDays: 20, absentDays: 2 }, staffCount: 5 };
    case ReportExportType.PHARMACY_SHRINK:
      return {
        byMovementType: [{ movementType: 'EXPIRED', quantity: 3 }],
        totalShrinkQuantity: 3,
      };
    case ReportExportType.INSURANCE_AGEING:
      return {
        buckets: [
          {
            label: '0-30d',
            claimCount: 1,
            outstandingAmount: '500.00',
          },
        ],
      };
    case ReportExportType.ABDM_ADOPTION:
      return {
        patients: { activePatientCount: 5, abhaLinkedCount: 2, abhaLinkedPercent: '40' },
        consents: { createdInRange: 1, grantedInRange: 1, deniedInRange: 0, revokedInRange: 0 },
        externalExchangeNote: 'Local records only',
      };
    default:
      return { type };
  }
}
