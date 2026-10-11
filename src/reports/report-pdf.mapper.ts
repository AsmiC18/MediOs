import { ReportExportType } from './dto/report-export.dto';
import { ReportPdfInput } from './report-pdf.util';

export function buildReportPdfInput(
  reportType: ReportExportType,
  data: Record<string, unknown>,
  meta: {
    from: string;
    to: string;
    branchId: string | null;
    generatedAt: string;
    periodYear?: number;
    periodMonth?: number;
    asOf?: string;
  },
): ReportPdfInput {
  const title = reportTitle(reportType);
  const notes: string[] = [];

  if (reportType === ReportExportType.ABDM_ADOPTION && typeof data.externalExchangeNote === 'string') {
    notes.push(data.externalExchangeNote);
  }

  if (reportType === ReportExportType.ATTENDANCE_SUMMARY && meta.periodYear && meta.periodMonth) {
    notes.push(`Payroll period: ${meta.periodYear}-${String(meta.periodMonth).padStart(2, '0')}`);
  }

  if (reportType === ReportExportType.IPD_OCCUPANCY && meta.asOf) {
    notes.push(`As-of snapshot: ${meta.asOf}`);
  }

  const tables = tablesForType(reportType, data);
  const periodLabel =
    reportType === ReportExportType.ATTENDANCE_SUMMARY && meta.periodYear && meta.periodMonth
      ? `${meta.periodYear}-${String(meta.periodMonth).padStart(2, '0')}`
      : reportType === ReportExportType.IPD_OCCUPANCY && meta.asOf
        ? meta.asOf
        : `${meta.from} — ${meta.to}`;

  return {
    title,
    from: periodLabel,
    to: periodLabel,
    branchId: meta.branchId,
    generatedAt: meta.generatedAt,
    notes: notes.length ? notes : undefined,
    tables,
  };
}

function reportTitle(type: ReportExportType): string {
  switch (type) {
    case ReportExportType.FINANCIAL:
      return 'Financial Summary';
    case ReportExportType.GST:
      return 'GST Compliance Summary';
    case ReportExportType.OPD_METRICS:
      return 'OPD Metrics';
    case ReportExportType.DEPARTMENT_REVENUE:
      return 'Department Revenue';
    case ReportExportType.PATIENT_COHORT:
      return 'Patient Cohort Analysis';
    case ReportExportType.ABDM_ADOPTION:
      return 'ABDM Adoption (Local Records)';
    case ReportExportType.PHARMACY_SHRINK:
      return 'Pharmacy Shrink';
    case ReportExportType.DAILY_DASHBOARD:
      return 'Daily Dashboard';
    case ReportExportType.IPD_OCCUPANCY:
      return 'IPD Occupancy';
    case ReportExportType.DOCTOR_PERFORMANCE:
      return 'Doctor Performance';
    case ReportExportType.INSURANCE_AGEING:
      return 'Insurance Claims Ageing';
    case ReportExportType.ATTENDANCE_SUMMARY:
      return 'Staff Attendance Summary';
    default:
      return `MediOS Report (${type})`;
  }
}

function tablesForType(
  type: ReportExportType,
  data: Record<string, unknown>,
): ReportPdfInput['tables'] {
  switch (type) {
    case ReportExportType.FINANCIAL: {
      const invoices = data.invoicesIssuedInRange as { count: number; totalAmount: string } | undefined;
      const payments = data.paymentsSucceededInRange as { count: number; totalAmount: string } | undefined;
      return [
        {
          title: 'Summary',
          headers: ['Metric', 'Count', 'Amount'],
          rows: [
            ['Invoices issued', String(invoices?.count ?? 0), invoices?.totalAmount ?? '0'],
            ['Payments succeeded', String(payments?.count ?? 0), payments?.totalAmount ?? '0'],
            ['Net cash collected', '', String(data.netCashCollected ?? '0')],
          ],
        },
      ];
    }
    case ReportExportType.OPD_METRICS: {
      const queue = data.queue as Record<string, number> | undefined;
      const appointments = data.appointments as Record<string, number> | undefined;
      return [
        {
          title: 'Queue',
          headers: ['Metric', 'Value'],
          rows: queue
            ? Object.entries(queue)
                .filter(([k]) => k !== 'timeBasis')
                .map(([k, v]) => [k, String(v)])
            : [],
        },
        {
          title: 'Appointments',
          headers: ['Metric', 'Value'],
          rows: appointments
            ? Object.entries(appointments)
                .filter(([k]) => k !== 'timeBasis')
                .map(([k, v]) => [k, String(v)])
            : [],
        },
      ];
    }
    case ReportExportType.DEPARTMENT_REVENUE: {
      const departments = (data.departments as Array<{ department: string; lineCount: number; revenue: string }>) ?? [];
      const totals = data.totals as { lineCount: number; revenue: string } | undefined;
      return [
        {
          title: 'Department breakdown (accrual / issuedAt)',
          headers: ['Department', 'Lines', 'Revenue'],
          rows: departments.map((d) => [d.department, String(d.lineCount), d.revenue]),
          footerRow: totals
            ? ['Total', String(totals.lineCount), totals.revenue]
            : undefined,
        },
      ];
    }
    case ReportExportType.PATIENT_COHORT: {
      const totals = data.totals as Record<string, number> | undefined;
      return [
        {
          title: 'Cohort totals (aggregate)',
          headers: ['Metric', 'Count'],
          rows: totals
            ? Object.entries(totals).map(([k, v]) => [k, String(v)])
            : [],
        },
      ];
    }
    case ReportExportType.ABDM_ADOPTION: {
      const patients = data.patients as Record<string, unknown> | undefined;
      const consents = data.consents as Record<string, unknown> | undefined;
      return [
        {
          title: 'ABHA linkage (local)',
          headers: ['Metric', 'Value'],
          rows: patients
            ? [
                ['Active patients', String(patients.activePatientCount ?? 0)],
                ['ABHA linked', String(patients.abhaLinkedCount ?? 0)],
                ['Linked %', String(patients.abhaLinkedPercent ?? '0')],
              ]
            : [],
        },
        {
          title: 'Consents in range',
          headers: ['Metric', 'Value'],
          rows: consents
            ? [
                ['Created', String(consents.createdInRange ?? 0)],
                ['Granted events', String(consents.grantedInRange ?? 0)],
                ['Denied events', String(consents.deniedInRange ?? 0)],
                ['Revoked events', String(consents.revokedInRange ?? 0)],
              ]
            : [],
        },
      ];
    }
    case ReportExportType.PHARMACY_SHRINK: {
      const rows = (data.byMovementType as Array<{ movementType: string; quantity: number }>) ?? [];
      return [
        {
          title: 'Shrink by movement type',
          headers: ['Movement', 'Quantity'],
          rows: rows.map((r) => [r.movementType, String(r.quantity)]),
          footerRow: ['Total shrink', String(data.totalShrinkQuantity ?? 0)],
        },
      ];
    }
    case ReportExportType.GST: {
      const summary = data.summary as Record<string, string | number> | undefined;
      const hsnRows =
        (data.hsnBreakdown as Array<Record<string, string>>) ?? [];
      return [
        {
          title: 'GST totals',
          headers: ['Metric', 'Value'],
          rows: summary
            ? [
                ['Invoices', String(summary.invoiceCount ?? 0)],
                ['Taxable value', String(summary.taxableValue ?? '0')],
                ['CGST', String(summary.cgst ?? '0')],
                ['SGST', String(summary.sgst ?? '0')],
                ['IGST', String(summary.igst ?? '0')],
                ['Total tax', String(summary.totalTax ?? '0')],
              ]
            : [],
        },
        {
          title: 'HSN/SAC breakdown (top rows)',
          headers: ['HSN/SAC', 'Taxable', 'Total tax'],
          rows: hsnRows.slice(0, 25).map((h) => [
            String(h.hsnSac ?? ''),
            String(h.taxableValue ?? '0'),
            String(h.totalTax ?? '0'),
          ]),
        },
      ];
    }
    case ReportExportType.INSURANCE_AGEING: {
      const buckets =
        (data.buckets as Array<Record<string, string | number>>) ?? [];
      return [
        {
          title: 'Claims ageing buckets',
          headers: ['Bucket', 'Claims', 'Outstanding'],
          rows: buckets.map((b) => [
            String(b.label ?? ''),
            String(b.claimCount ?? 0),
            String(b.outstandingAmount ?? '0'),
          ]),
        },
      ];
    }
    case ReportExportType.ATTENDANCE_SUMMARY: {
      const totals = data.totals as Record<string, number> | undefined;
      return [
        {
          title: 'Monthly attendance totals',
          headers: ['Metric', 'Value'],
          rows: totals
            ? Object.entries(totals).map(([k, v]) => [k, String(v)])
            : [['staffCount', String(data.staffCount ?? 0)]],
        },
      ];
    }
    case ReportExportType.DAILY_DASHBOARD: {
      const billing = data.billing as Record<string, string | number> | undefined;
      const clinical = data.clinical as Record<string, number> | undefined;
      return [
        {
          title: 'Daily snapshot',
          headers: ['Domain', 'Metric', 'Value'],
          rows: [
            ...(billing
              ? Object.entries(billing).map(([k, v]) => ['Billing', k, String(v)])
              : []),
            ...(clinical
              ? Object.entries(clinical).map(([k, v]) => ['Clinical', k, String(v)])
              : []),
          ],
        },
      ];
    }
    case ReportExportType.IPD_OCCUPANCY: {
      return [
        {
          title: 'Occupancy',
          headers: ['Metric', 'Value'],
          rows: [
            ['Total beds', String(data.totalBeds ?? 0)],
            ['Occupied beds', String(data.occupiedBeds ?? 0)],
            ['Occupancy %', String(data.occupancyPercent ?? '0')],
          ],
        },
      ];
    }
    case ReportExportType.DOCTOR_PERFORMANCE: {
      const doctors =
        (data.doctors as Array<Record<string, string | number>>) ?? [];
      return [
        {
          title: 'Doctor performance (aggregate)',
          headers: ['Doctor', 'Encounters', 'Revenue'],
          rows: doctors.slice(0, 50).map((d) => [
            String(d.doctorLabel ?? d.doctorId ?? ''),
            String(d.encounterCount ?? 0),
            String(d.revenue ?? '0'),
          ]),
        },
      ];
    }
    default:
      return [
        {
          title: 'Report data',
          headers: ['Field', 'Value'],
          rows: [['type', type]],
        },
      ];
  }
}
