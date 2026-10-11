import { InvoiceStatus, Prisma } from '@prisma/client';
import { roundMoney } from '../billing/utils/money.util';

export type DepartmentRevenueCode =
  | 'OPD'
  | 'IPD'
  | 'EMERGENCY'
  | 'DIAGNOSTICS'
  | 'SURGERY'
  | 'PHARMACY'
  | 'OTHER';

export type DepartmentRevenueRow = {
  department: DepartmentRevenueCode;
  lineCount: number;
  revenue: string;
};

export type DepartmentRevenueSummary = {
  from: string;
  to: string;
  branchId: string | null;
  financialBasis: 'accrual';
  timeBasis: 'Invoice.issuedAt';
  invoiceStatusFilter: 'ISSUED|PAID';
  revenueField: 'InvoiceItem.lineTotalWithTax';
  departments: DepartmentRevenueRow[];
  totals: {
    lineCount: number;
    revenue: string;
  };
};

/** Classify invoice line revenue by department billing sourceKey conventions. */
export function classifyDepartmentFromSourceKey(
  sourceKey: string | null | undefined,
): DepartmentRevenueCode {
  if (!sourceKey?.trim()) {
    return 'OTHER';
  }
  const key = sourceKey.trim();
  if (key.startsWith('staff.attendance.consultation:')) {
    return 'OPD';
  }
  if (key.startsWith('ipd.discharge:')) {
    return 'IPD';
  }
  if (key.startsWith('emergency.visit:')) {
    return 'EMERGENCY';
  }
  if (key.startsWith('diagnostic.order.item:')) {
    return 'DIAGNOSTICS';
  }
  if (key.startsWith('surgery.procedure:')) {
    return 'SURGERY';
  }
  if (key.startsWith('pharmacy.dispensing.item:')) {
    return 'PHARMACY';
  }
  return 'OTHER';
}

export async function buildDepartmentRevenueSummary(
  prisma: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  input: {
    hospitalId: string;
    branchId?: string | null;
    from: string;
    to: string;
  },
): Promise<DepartmentRevenueSummary> {
  const invoiceFilter: Prisma.InvoiceWhereInput = {
    hospitalId: input.hospitalId,
    status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] },
    issuedAt: {
      gte: new Date(input.from),
      lt: new Date(input.to),
    },
  };
  if (input.branchId != null) {
    invoiceFilter.branchId = input.branchId;
  }

  const items = await prisma.invoiceItem.findMany({
    where: {
      hospitalId: input.hospitalId,
      invoice: invoiceFilter,
    },
    select: {
      sourceKey: true,
      lineTotalWithTax: true,
    },
  });

  const byDept = new Map<DepartmentRevenueCode, { count: number; sum: Prisma.Decimal }>();
  const ensure = (code: DepartmentRevenueCode) => {
    if (!byDept.has(code)) {
      byDept.set(code, { count: 0, sum: new Prisma.Decimal(0) });
    }
    return byDept.get(code)!;
  };

  for (const item of items) {
    const dept = classifyDepartmentFromSourceKey(item.sourceKey);
    const bucket = ensure(dept);
    bucket.count += 1;
    bucket.sum = bucket.sum.add(item.lineTotalWithTax);
  }

  const order: DepartmentRevenueCode[] = [
    'OPD',
    'IPD',
    'EMERGENCY',
    'DIAGNOSTICS',
    'SURGERY',
    'PHARMACY',
    'OTHER',
  ];

  let totalLines = 0;
  let totalSum = new Prisma.Decimal(0);
  const departments: DepartmentRevenueRow[] = [];

  for (const department of order) {
    const bucket = byDept.get(department);
    if (!bucket || bucket.count === 0) {
      continue;
    }
    totalLines += bucket.count;
    totalSum = totalSum.add(bucket.sum);
    departments.push({
      department,
      lineCount: bucket.count,
      revenue: roundMoney(bucket.sum).toFixed(2),
    });
  }

  return {
    from: input.from,
    to: input.to,
    branchId: input.branchId ?? null,
    financialBasis: 'accrual',
    timeBasis: 'Invoice.issuedAt',
    invoiceStatusFilter: 'ISSUED|PAID',
    revenueField: 'InvoiceItem.lineTotalWithTax',
    departments,
    totals: {
      lineCount: totalLines,
      revenue: roundMoney(totalSum).toFixed(2),
    },
  };
}
