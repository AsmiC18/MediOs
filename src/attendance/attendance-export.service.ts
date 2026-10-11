import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AttendancePayrollExportRow,
  serializeAttendancePayrollToCsv,
} from './attendance-export.util';
import { AttendancePayrollExportDto } from './dto/attendance-payroll-export.dto';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

export type AttendanceExportResult =
  | { type: 'csv'; body: string; filename: string }
  | {
      type: 'json';
      body: {
        periodYear: number;
        periodMonth: number;
        branchId: string | null;
        rows: AttendancePayrollExportRow[];
      };
    };

@Injectable()
export class AttendanceExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async exportPayroll(
    user: AuthenticatedUser,
    dto: AttendancePayrollExportDto,
  ): Promise<AttendanceExportResult> {
    if (dto.periodMonth < 1 || dto.periodMonth > 12) {
      throw new BadRequestException('periodMonth must be between 1 and 12');
    }

    let branchIdFilter: string | null | undefined = undefined;
    if (user.branchId == null && dto.branchId !== undefined) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
      });
      if (!branch || branch.hospitalId !== user.hospitalId) {
        throw new NotFoundException('Branch not found');
      }
      branchIdFilter = dto.branchId;
    }

    const whereInput: Prisma.AttendanceMonthlySummaryWhereInput = {
      hospitalId: user.hospitalId,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
      ...(branchIdFilter !== undefined && { branchId: branchIdFilter }),
    };

    const where = applyBranchScope(user, whereInput);

    const summaries = await this.prisma.attendanceMonthlySummary.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ branchId: 'asc' }, { userId: 'asc' }],
    });

    const rows: AttendancePayrollExportRow[] = summaries.map((summary) => {
      assertBranchAccess(user, summary.branchId);
      return {
        hospitalId: summary.hospitalId,
        branchId: summary.branchId,
        userId: summary.userId,
        staffEmail: summary.user.email,
        staffName: summary.user.name,
        periodYear: summary.periodYear,
        periodMonth: summary.periodMonth,
        presentDays: summary.presentDays,
        lateDays: summary.lateDays,
        halfDayDays: summary.halfDayDays,
        absentDays: summary.absentDays,
        totalLateMinutes: summary.totalLateMinutes,
        totalEarlyLeaveMinutes: summary.totalEarlyLeaveMinutes,
      };
    });

    await this.auditService.log({
      action: 'ATTENDANCE_PAYROLL_EXPORT',
      entity: 'AttendanceMonthlySummary',
      entityId: null,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? branchIdFilter ?? null,
      userId: user.sub,
      metadata: {
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        format: dto.format,
        rowCount: rows.length,
      },
    });

    const periodLabel = `${dto.periodYear}-${String(dto.periodMonth).padStart(2, '0')}`;

    if (dto.format === 'csv') {
      return {
        type: 'csv',
        body: serializeAttendancePayrollToCsv(rows),
        filename: `attendance-payroll-${periodLabel}.csv`,
      };
    }

    return {
      type: 'json',
      body: {
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        branchId: user.branchId ?? branchIdFilter ?? null,
        rows,
      },
    };
  }
}
