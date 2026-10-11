import { ReportProjectionType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const BILLING_AFFECTED_REPORT_PROJECTION_TYPES: ReportProjectionType[] = [
  ReportProjectionType.DAILY_DASHBOARD,
  ReportProjectionType.DEPARTMENT_REVENUE,
  ReportProjectionType.GST_SUMMARY,
];

export async function invalidateReportProjectionsForBillingMutation(
  prisma: PrismaService,
  input: { hospitalId: string; branchId: string | null },
): Promise<void> {
  await prisma.reportProjection.deleteMany({
    where: {
      hospitalId: input.hospitalId,
      branchId: input.branchId,
      reportType: { in: BILLING_AFFECTED_REPORT_PROJECTION_TYPES },
    },
  });
}

export async function invalidateAllHospitalReportProjections(
  prisma: PrismaService,
  hospitalId: string,
): Promise<void> {
  await prisma.reportProjection.deleteMany({
    where: { hospitalId },
  });
}
