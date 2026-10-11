import {
  AbdmConsentStatus,
  AbhaLinkStatus,
  InvoiceStatus,
  PrismaClient,
} from '@prisma/client';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { toStaffJwtUser } from '../auth/staff-jwt-payload.util';
import { toPatientPrincipal } from '../portal/portal-auth/portal-jwt-payload.util';
import { PATIENT_PRINCIPAL_TYPE } from '../portal/portal.types';
import { ReportExportFormat, ReportExportType } from './dto/report-export.dto';
import { assertValidReportDateRange } from './report-date-range.util';
import { createPassThroughReportProjectionService } from './report-projection.test-util';
import { ReportsService } from './reports.service';

describe('Reports R2 integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let otherHospitalId: string;
  let branchA: string;
  let branchB: string;
  let userId: string;
  let patientId: string;

  let service: ReportsService;

  const range = {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-02-01T00:00:00.000Z',
  };

  const hospitalUser = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  const branchAUser = () => ({
    sub: userId,
    hospitalId,
    branchId: branchA,
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    service = new ReportsService(
      prisma as never,
      new AuditService(prisma as never),
      createPassThroughReportProjectionService(),
    );

    const hospital = await prisma.hospital.create({
      data: { name: `R2 ${runId}`, code: `R2-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `R2O ${runId}`, code: `R2O-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    branchA = (
      await prisma.branch.create({
        data: { hospitalId, name: 'A', code: `R2A-${runId}` },
      })
    ).id;

    branchB = (
      await prisma.branch.create({
        data: { hospitalId, name: 'B', code: `R2B-${runId}` },
      })
    ).id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `R2Role-${runId}` },
    });

    const user = await prisma.user.create({
      data: {
        hospitalId,
        roleId: role.id,
        email: `r2-${runId}@test.com`,
        passwordHash: 'hash',
        name: 'R2',
      },
    });
    userId = user.id;

    patientId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId: branchA,
          firstName: 'Pat',
          phone: `9${runId.replace(/\D/g, '').slice(-9)}`,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      })
    ).id;

    await prisma.invoice.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        invoiceNumber: `R2-INV-${runId}`,
        status: InvoiceStatus.ISSUED,
        subtotalAmount: 200,
        taxAmount: 0,
        totalAmount: 200,
        issuedAt: new Date('2026-01-10T00:00:00.000Z'),
        items: {
          create: {
            hospitalId,
            description: 'OPD consult',
            quantity: 1,
            unitPrice: 200,
            lineTotal: 200,
            taxableAmount: 200,
            lineTotalWithTax: 200,
            sourceKey: `staff.attendance.consultation:appt-${runId}`,
          },
        },
      },
    });

    await prisma.appointment.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        startAt: new Date('2026-01-12T10:00:00.000Z'),
        endAt: new Date('2026-01-12T10:30:00.000Z'),
      },
    });

    await prisma.patientAbhaLink.create({
      data: {
        hospitalId,
        patientId,
        linkStatus: AbhaLinkStatus.LINKED,
        abhaAddress: 'user@sbx',
        linkedAt: new Date('2026-01-05T00:00:00.000Z'),
      },
    });

    await prisma.abdmConsent.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        purpose: 'Care',
        hiTypes: ['Prescription'],
        status: AbdmConsentStatus.GRANTED,
        requestedByUserId: userId,
        grantedAt: new Date('2026-01-08T00:00:00.000Z'),
        createdAt: new Date('2026-01-08T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  itDb('covers all 11 fixed report endpoints via service', async () => {
    expect((await service.getDailyDashboard(hospitalUser(), range)).dateRange.from).toBe(range.from);
    expect((await service.getOpdMetrics(hospitalUser(), range)).appointments.totalScheduled).toBeGreaterThanOrEqual(1);
    expect((await service.getIpdOccupancy(hospitalUser(), { asOf: range.to })).asOf).toBe(range.to);
    expect((await service.getDepartmentRevenue(hospitalUser(), range)).totals.lineCount).toBeGreaterThanOrEqual(1);
    expect((await service.getDoctorPerformance(hospitalUser(), range)).doctors).toBeDefined();
    expect((await service.getPatientCohort(hospitalUser(), range)).totals.registeredInRange).toBeGreaterThanOrEqual(1);
    expect((await service.getGstSummary(hospitalUser(), range)).summary.invoiceCount).toBeGreaterThanOrEqual(1);
    expect((await service.getAttendanceSummary(hospitalUser(), { periodYear: 2026, periodMonth: 1 })).periodYear).toBe(2026);
    expect((await service.getPharmacyShrinkSummary(hospitalUser(), range)).totalShrinkQuantity).toBeDefined();
    expect((await service.getInsuranceClaimsAgeing(hospitalUser(), range)).totals).toBeDefined();
    const abdm = await service.getAbdmAdoption(hospitalUser(), range);
    expect(abdm.dataScope).toBe('local_abdm_records_only');
    expect(abdm.patients.abhaLinkedCount).toBeGreaterThanOrEqual(1);
  });

  itDb('enforces date range rules', async () => {
    expect(() =>
      assertValidReportDateRange('2026-02-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ).toThrow(BadRequestException);

    expect(() =>
      assertValidReportDateRange('2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
    ).toThrow(BadRequestException);

    await expect(
      service.getDepartmentRevenue(hospitalUser(), {
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  itDb('supports hospital-wide rollup and branch filtering', async () => {
    const rollup = await service.getDepartmentRevenue(hospitalUser(), range);
    expect(rollup.branchId).toBeNull();

    const branchOnly = await service.getDepartmentRevenue(hospitalUser(), {
      ...range,
      branchId: branchA,
    });
    expect(branchOnly.branchId).toBe(branchA);
    expect(branchOnly.totals.lineCount).toBeGreaterThanOrEqual(1);

    await expect(
      service.getOpdMetrics(branchAUser(), { ...range, branchId: branchB }),
    ).rejects.toThrow(ForbiddenException);
  });

  itDb('rejects cross-hospital branch selection', async () => {
    const foreignBranch = await prisma.branch.create({
      data: { hospitalId: otherHospitalId, name: 'X', code: `R2X-${runId}` },
    });

    await expect(
      service.getPatientCohort(hospitalUser(), { ...range, branchId: foreignBranch.id }),
    ).rejects.toThrow(ForbiddenException);
  });

  itDb('exports CSV and PDF with audit', async () => {
    const before = await prisma.auditLog.count({
      where: { hospitalId, action: 'REPORT_EXPORTED' },
    });

    const csv = await service.exportReport(hospitalUser(), {
      ...range,
      type: ReportExportType.DEPARTMENT_REVENUE,
      format: ReportExportFormat.CSV,
    });
    expect(csv.type).toBe('csv');
    if (csv.type === 'csv') {
      expect(csv.body).toContain('department');
      expect(csv.body).toContain('OPD');
    }

    const pdf = await service.exportReport(hospitalUser(), {
      ...range,
      type: ReportExportType.FINANCIAL,
      format: ReportExportFormat.PDF,
    });
    expect(pdf.type).toBe('pdf');
    if (pdf.type === 'pdf') {
      expect(pdf.body.subarray(0, 4).toString('ascii')).toBe('%PDF');
    }

    const opdPdf = await service.exportReport(hospitalUser(), {
      ...range,
      type: ReportExportType.OPD_METRICS,
      format: ReportExportFormat.PDF,
    });
    expect(opdPdf.type).toBe('pdf');

    const after = await prisma.auditLog.count({
      where: { hospitalId, action: 'REPORT_EXPORTED' },
    });
    expect(after).toBeGreaterThan(before);
  });

  itDb('de-identifies cohort and ABDM reports', async () => {
    const cohort = await service.getPatientCohort(hospitalUser(), range);
    expect(JSON.stringify(cohort)).not.toMatch(/firstName|phone|email|abha/i);

    const abdm = await service.getAbdmAdoption(hospitalUser(), range);
    expect(JSON.stringify(abdm)).not.toMatch(/linkToken|abhaNumber|abhaAddress/i);
    expect(abdm.externalExchangeNote).toContain('local');
  });

  itDb('preserves staff/patient JWT separation at auth helpers', async () => {
    expect(() =>
      toPatientPrincipal({
        principalType: 'STAFF',
        sub: userId,
        hospitalId,
        roleId: 'role',
        role: 'ADMIN',
      } as never),
    ).toThrow(UnauthorizedException);

    expect(() =>
      toStaffJwtUser({
        principalType: PATIENT_PRINCIPAL_TYPE,
        sub: patientId,
        hospitalId,
        branchId: branchA,
      }),
    ).toThrow(UnauthorizedException);
  });

  itDb('regression: GST and financial exports still work', async () => {
    const gst = await service.getGstSummary(hospitalUser(), range);
    expect(gst.summary.invoiceCount).toBeGreaterThanOrEqual(1);

    const exported = await service.exportReport(hospitalUser(), {
      ...range,
      type: ReportExportType.GST,
      format: ReportExportFormat.CSV,
    });
    expect(exported.type).toBe('csv');
  });
});
