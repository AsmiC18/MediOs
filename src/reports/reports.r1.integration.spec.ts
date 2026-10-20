import {
  BedStatus,
  InsuranceClaimStatus,
  PharmacyStockMovementType,
  PrismaClient,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { ReportExportFormat, ReportExportType } from './dto/report-export.dto';
import { createPassThroughReportProjectionService } from './report-projection.test-util';
import { ReportsService } from './reports.service';

describe('Reports R1 integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let otherHospitalId: string;
  let branchA: string;
  let branchB: string;
  let userId: string;
  let patientId: string;
  let invoiceId: string;
  let policyId: string;
  let providerId: string;

  let service: ReportsService;
  let audit: AuditService;

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

    audit = new AuditService(prisma as never);
    service = new ReportsService(
      prisma as never,
      audit,
      createPassThroughReportProjectionService(),
    );

    const hospital = await prisma.hospital.create({
      data: { name: `R1 ${runId}`, code: `R1-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `R1O ${runId}`, code: `R1O-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    branchA = (
      await prisma.branch.create({
        data: { hospitalId, name: 'A', code: `RA-${runId}` },
      })
    ).id;

    branchB = (
      await prisma.branch.create({
        data: { hospitalId, name: 'B', code: `RB-${runId}` },
      })
    ).id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `R1Role-${runId}` },
    });

    const user = await prisma.user.create({
      data: {
        hospitalId,
        roleId: role.id,
        email: `r1-${runId}@test.com`,
        passwordHash: 'hash',
        name: 'R1 Tester',
      },
    });
    userId = user.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId: branchA,
        firstName: 'P',
        lastName: runId,
        phone: `9${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;

    const provider = await prisma.insuranceProvider.create({
      data: {
        hospitalId,
        name: `Prov ${runId}`,
        providerType: 'TPA',
      },
    });
    providerId = provider.id;

    const policy = await prisma.patientInsurancePolicy.create({
      data: {
        hospitalId,
        patientId,
        providerId,
        policyNumber: `POL-${runId}`,
      },
    });
    policyId = policy.id;

    const invoice = await prisma.invoice.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        invoiceNumber: `INV-${runId}`,
        status: 'ISSUED',
        subtotalAmount: 100,
        taxAmount: 0,
        totalAmount: 100,
        issuedAt: new Date('2026-01-10T00:00:00.000Z'),
      },
    });
    invoiceId = invoice.id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.$disconnect();
  });

  const range = {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-02-01T00:00:00.000Z',
  };

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  it('skips when database is unavailable', () => {
    expect(true).toBe(true);
  });

  itDb('insurance ageing includes old open claim and excludes paid-before-asOf', async () => {
    const asOfRange = {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-10-07T00:00:00.000Z',
    };

    const openOld = await prisma.insuranceClaim.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        policyId,
        providerId,
        invoiceId,
        claimNumber: `CL-OPEN-${runId}`,
        claimedAmount: 1000,
        approvedAmount: 800,
        paidAmount: 0,
        status: InsuranceClaimStatus.SUBMITTED,
        submittedAt: new Date('2025-06-01T00:00:00.000Z'),
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      },
    });

    const paidBefore = await prisma.insuranceClaim.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        policyId,
        providerId,
        invoiceId,
        claimNumber: `CL-PAID-${runId}`,
        claimedAmount: 500,
        approvedAmount: 500,
        paidAmount: 500,
        status: InsuranceClaimStatus.PAID,
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        paidAt: new Date('2026-09-15T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const branchBClaim = await prisma.insuranceClaim.create({
      data: {
        hospitalId,
        branchId: branchB,
        patientId,
        policyId,
        providerId,
        invoiceId,
        claimNumber: `CL-BB-${runId}`,
        claimedAmount: 200,
        approvedAmount: 200,
        paidAmount: 0,
        status: InsuranceClaimStatus.SUBMITTED,
        submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const summary = await service.getInsuranceClaimsAgeing(hospitalUser(), asOfRange);

    expect(summary.totals.claimCount).toBeGreaterThanOrEqual(1);
    expect(summary.totals.claimCount).toBe(2);
    expect(summary.buckets.some((b) => b.claimCount > 0)).toBe(true);

    const branchOnly = await service.getInsuranceClaimsAgeing(branchAUser(), asOfRange);
    expect(branchOnly.totals.claimCount).toBe(1);

    await prisma.insuranceClaim.deleteMany({
      where: { id: { in: [openOld.id, paidBefore.id, branchBClaim.id] } },
    });
  });

  itDb('pharmacy shrink counts only shrink movement types in range', async () => {
    const product = await prisma.pharmacyProduct.create({
      data: {
        hospitalId,
        branchId: branchA,
        name: `Prod ${runId}`,
        sku: `SKU-${runId}`,
        unit: 'TAB',
        isActive: true,
        reorderLevel: 1,
      },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    await prisma.pharmacyStockMovement.create({
      data: {
        hospitalId,
        branchId: branchA,
        productId: product.id,
        movementType: PharmacyStockMovementType.ADJUSTMENT_OUT,
        quantity: 3,
        createdByUserId: user.id,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
      },
    });

    await prisma.pharmacyStockMovement.create({
      data: {
        hospitalId,
        branchId: branchA,
        productId: product.id,
        movementType: PharmacyStockMovementType.PURCHASE,
        quantity: 10,
        createdByUserId: user.id,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
      },
    });

    const summary = await service.getPharmacyShrinkSummary(hospitalUser(), {
      ...range,
      branchId: branchA,
    });

    expect(summary.totalShrinkQuantity).toBeGreaterThanOrEqual(3);
    expect(summary.byMovementType.find((r) => r.movementType === 'ADJUSTMENT_OUT')?.quantity).toBe(
      3,
    );
    expect(summary.byMovementType.find((r) => r.movementType === 'EXPIRED')?.quantity).toBe(0);
  });

  itDb('ipd occupancy uses asOf point-in-time semantics', async () => {
    const bed = await prisma.ipdBed.create({
      data: {
        hospitalId,
        branchId: branchA,
        wardName: 'W1',
        roomNumber: '101',
        bedNumber: `B-${runId}`,
        status: BedStatus.AVAILABLE,
      },
    });

    const result = await service.getIpdOccupancy(hospitalUser(), {
      asOf: '2026-10-06T12:00:00.000Z',
      branchId: branchA,
    });

    expect(result.totalBeds).toBeGreaterThanOrEqual(1);
    expect(result.asOf).toBe('2026-10-06T12:00:00.000Z');

    await prisma.ipdBed.delete({ where: { id: bed.id } });
  });

  itDb('daily dashboard aggregates financial and appointment counts', async () => {
    await prisma.appointment.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId,
        startAt: new Date('2026-01-12T10:00:00.000Z'),
        endAt: new Date('2026-01-12T10:30:00.000Z'),
      },
    });

    const dashboard = await service.getDailyDashboard(hospitalUser(), range);
    expect(dashboard.dateRange.from).toBe(range.from);
    expect(dashboard.financial.invoicesIssuedInRange.count).toBeGreaterThanOrEqual(1);
    expect(dashboard.appointments.totalScheduled).toBeGreaterThanOrEqual(1);
  });

  itDb('branch user cannot query another branch in OPD metrics', async () => {
    await expect(
      service.getOpdMetrics(branchAUser(), { ...range, branchId: branchB }),
    ).rejects.toThrow(ForbiddenException);
  });

  itDb('pharmacy shrink CSV export uses reports export path', async () => {
    const exported = await service.exportReport(hospitalUser(), {
      ...range,
      branchId: branchA,
      type: ReportExportType.PHARMACY_SHRINK,
      format: ReportExportFormat.CSV,
    });

    expect(exported.type).toBe('csv');
    if (exported.type === 'csv') {
      expect(exported.body).toContain('movementType');
      expect(exported.body).toContain('ADJUSTMENT_OUT');
    }
  });

  itDb('financial summary exposes explicit accrual vs cash fields', async () => {
    const financial = await service.getFinancialSummary(hospitalUser(), range);
    expect(financial.invoicesIssuedInRange.timeBasis).toBe('issuedAt');
    expect(financial.paymentsSucceededInRange.timeBasis).toBe('paidAt|createdAt');
    expect(financial.netCashCollected).toBe(financial.netCollected);
  });
});
