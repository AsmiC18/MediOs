import {
  escapeCsvCell,
  neutralizeCsvFormulaInjection,
} from '../audit/audit-log-csv.util';

export type FinancialSummaryExportRow = {
  invoiceCount: number;
  invoiceTotal: string;
  successfulPaymentCount: number;
  successfulPaymentTotal: string;
  refundCount: number;
  refundTotal: string;
  netCollected: string;
};

export type GstSummaryExportRow = {
  invoiceCount: number;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
};

export type HsnBreakdownExportRow = {
  hsnSac: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
};

const FINANCIAL_HEADERS = [
  'invoiceCount',
  'invoiceTotal',
  'successfulPaymentCount',
  'successfulPaymentTotal',
  'refundCount',
  'refundTotal',
  'netCollected',
] as const;

const GST_SUMMARY_HEADERS = [
  'invoiceCount',
  'taxableValue',
  'cgst',
  'sgst',
  'igst',
  'totalTax',
] as const;

const HSN_HEADERS = [
  'hsnSac',
  'taxableValue',
  'cgst',
  'sgst',
  'igst',
  'totalTax',
] as const;

function rowToCsvLine(values: string[]): string {
  return values.map((v) => escapeCsvCell(v)).join(',');
}

export function serializeFinancialSummaryToCsv(
  row: FinancialSummaryExportRow,
): string {
  const lines = [
    FINANCIAL_HEADERS.join(','),
    rowToCsvLine([
      String(row.invoiceCount),
      row.invoiceTotal,
      String(row.successfulPaymentCount),
      row.successfulPaymentTotal,
      String(row.refundCount),
      row.refundTotal,
      row.netCollected,
    ]),
  ];
  return lines.join('\r\n');
}

export function serializeGstReportToCsv(
  summary: GstSummaryExportRow,
  hsnBreakdown: HsnBreakdownExportRow[],
): string {
  const lines = [
    GST_SUMMARY_HEADERS.join(','),
    rowToCsvLine([
      String(summary.invoiceCount),
      summary.taxableValue,
      summary.cgst,
      summary.sgst,
      summary.igst,
      summary.totalTax,
    ]),
    '',
    HSN_HEADERS.join(','),
  ];

  for (const row of hsnBreakdown) {
    lines.push(
      rowToCsvLine([
        neutralizeCsvFormulaInjection(row.hsnSac),
        row.taxableValue,
        row.cgst,
        row.sgst,
        row.igst,
        row.totalTax,
      ]),
    );
  }

  return lines.join('\r\n');
}

export function serializePharmacyShrinkToCsv(
  rows: Array<{ movementType: string; quantity: number }>,
  totalShrinkQuantity: number,
): string {
  const lines = ['movementType,quantity', `TOTAL,${totalShrinkQuantity}`];
  for (const row of rows) {
    lines.push(
      rowToCsvLine([
        neutralizeCsvFormulaInjection(row.movementType),
        String(row.quantity),
      ]),
    );
  }
  return lines.join('\r\n');
}

export function serializePharmacySalesToCsv(summary: Record<string, string | number>): string {
  const lines = ['metric,value'];
  for (const [key, value] of Object.entries(summary)) {
    lines.push(rowToCsvLine([key, String(value)]));
  }
  return lines.join('\r\n');
}

export function serializePharmacyInventoryToCsv(summary: Record<string, string | number>): string {
  return serializePharmacySalesToCsv(summary);
}

export function serializeDepartmentRevenueToCsv(
  rows: Array<{ department: string; lineCount: number; revenue: string }>,
  totals: { lineCount: number; revenue: string },
): string {
  const lines = ['department,lineCount,revenue'];
  for (const row of rows) {
    lines.push(
      rowToCsvLine([row.department, String(row.lineCount), row.revenue]),
    );
  }
  lines.push(rowToCsvLine(['TOTAL', String(totals.lineCount), totals.revenue]));
  return lines.join('\r\n');
}

export function serializePatientCohortToCsv(summary: {
  totals: Record<string, number>;
  byRegistrationMonth: Array<{ month: string; registrations: number }>;
}): string {
  const lines = ['metric,count'];
  for (const [key, value] of Object.entries(summary.totals)) {
    lines.push(rowToCsvLine([key, String(value)]));
  }
  lines.push('');
  lines.push('month,registrations');
  for (const row of summary.byRegistrationMonth) {
    lines.push(rowToCsvLine([row.month, String(row.registrations)]));
  }
  return lines.join('\r\n');
}

export function serializeAbdmAdoptionToCsv(summary: {
  patients: { activePatientCount: number; abhaLinkedCount: number; abhaLinkedPercent: string };
  consents: { createdInRange: number; grantedInRange: number; deniedInRange: number; revokedInRange: number };
}): string {
  const lines = [
    'metric,value',
    rowToCsvLine(['activePatientCount', String(summary.patients.activePatientCount)]),
    rowToCsvLine(['abhaLinkedCount', String(summary.patients.abhaLinkedCount)]),
    rowToCsvLine(['abhaLinkedPercent', summary.patients.abhaLinkedPercent]),
    rowToCsvLine(['consentsCreatedInRange', String(summary.consents.createdInRange)]),
    rowToCsvLine(['consentsGrantedInRange', String(summary.consents.grantedInRange)]),
    rowToCsvLine(['consentsDeniedInRange', String(summary.consents.deniedInRange)]),
    rowToCsvLine(['consentsRevokedInRange', String(summary.consents.revokedInRange)]),
  ];
  return lines.join('\r\n');
}

export { escapeCsvCell, neutralizeCsvFormulaInjection };
