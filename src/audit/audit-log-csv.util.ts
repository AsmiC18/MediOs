import { AuditLogListItemDto } from './dto/audit-log-response.dto';

const CSV_HEADERS = [
  'id',
  'hospitalId',
  'branchId',
  'actorUserId',
  'action',
  'entity',
  'entityId',
  'createdAt',
] as const;

const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

/**
 * Neutralizes spreadsheet formula injection for CSV consumers.
 * Values starting with = + - @ are prefixed with a single quote.
 */
export function neutralizeCsvFormulaInjection(value: string): string {
  if (FORMULA_PREFIX_PATTERN.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function escapeCsvCell(value: string): string {
  const neutral = neutralizeCsvFormulaInjection(value);
  if (/[",\r\n]/.test(neutral)) {
    return `"${neutral.replace(/"/g, '""')}"`;
  }
  return neutral;
}

export function auditLogRowToCsvCells(row: AuditLogListItemDto): string[] {
  return [
    row.id,
    row.hospitalId,
    row.branchId ?? '',
    row.actorUserId ?? '',
    row.action,
    row.entity,
    row.entityId ?? '',
    row.createdAt.toISOString(),
  ];
}

export function serializeAuditLogsToCsv(rows: AuditLogListItemDto[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(auditLogRowToCsvCells(row).map((c) => escapeCsvCell(c)).join(','));
  }
  return lines.join('\r\n');
}
