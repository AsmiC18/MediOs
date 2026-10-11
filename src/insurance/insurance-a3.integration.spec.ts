import {
  InsuranceClaimStatus,
  InsuranceCopayType,
  InsuranceProviderType,
  InvoiceStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JobService } from '../jobs/job.service';
import { InsuranceRateResolverService } from './insurance-rate-resolver.service';
import { InsuranceService } from './insurance.service';
import { InsuranceClaimSubmitJobHandler } from './insurance-claim-submit.job-handler';
import { InsuranceClaimExternalService } from './insurance-claim-external.service';
import { ManualInsurancePayerAdapter } from './adapters/manual-insurance-payer.adapter';
import { InvoiceSplitPayerService } from '../billing/invoice-split-payer.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { InsuranceClaimExternalSubmissionStatus } from '@prisma/client';

describe('A3 insurance flow (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;
  let invoiceId: string;
  let service: InsuranceService;
  let submitHandler: InsuranceClaimSubmitJobHandler;

  const user = () => ({
    sub: userId,
    hospitalId,
    branchId: null as string | null,
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    const jobService = new JobService(prisma as never);
    const auditService = new AuditService(prisma as never);
    const rateResolver = new InsuranceRateResolverService(prisma as never);
    const outboxService = new DomainEventOutboxService(prisma as never, jobService);
    service = new InsuranceService(
      prisma as never,
      auditService,
      jobService,
      rateResolver,
      new InvoiceSplitPayerService(prisma as never, auditService),
      outboxService,
    );
    submitHandler = new InsuranceClaimSubmitJobHandler(
      new InsuranceClaimExternalService(
        prisma as never,
        auditService,
        new ManualInsurancePayerAdapter(),
      ),
    );

    const hospital = await prisma.hospital.create({
      data: { name: `A3 ${runId}`, code: `A3-${runId}` },
    });
    hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `Role-${runId}` },
    });

    const admin = await prisma.user.create({
      data: {
        hospitalId,
        branchId,
        roleId: role.id,
        name: 'Admin',
        email: `a3-admin-${runId}@example.com`,
        passwordHash: 'hash',
      },
    });
    userId = admin.id;

    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Pat',
        lastName: runId,
        phone: `9${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  it('runs policy → empanelment → package → preauth → invoice → claim → approve → co-pay → payment amount', async () => {
    if (!dbAvailable) {
      return;
    }

    const provider = await service.createProvider(user(), {
      name: 'Test TPA',
      providerType: InsuranceProviderType.TPA,
      code: `TPA-${runId}`,
    });

    const empanelment = await service.createEmpanelment(user(), {
      providerId: provider.id,
      branchId,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2027-12-31',
    });

    const pkg = await prisma.insurancePackage.create({
      data: {
        hospitalId,
        providerId: provider.id,
        empanelmentId: empanelment.id,
        code: `PKG-${runId}`,
        name: 'Standard',
      },
    });

    await prisma.insurancePackageRate.create({
      data: {
        packageId: pkg.id,
        hospitalId,
        serviceCode: 'CONSULT',
        serviceName: 'Consultation',
        rate: new Prisma.Decimal('500'),
        effectiveFrom: new Date('2026-01-01'),
      },
    });

    const policy = await service.createPolicy(user(), {
      patientId,
      providerId: provider.id,
      policyNumber: `POL-${runId}`,
      copayType: InsuranceCopayType.PERCENTAGE,
      copayValue: 20,
      empanelmentId: empanelment.id,
    });

    const preAuth = await service.createPreAuthorization(user(), {
      patientId,
      policyId: policy.id,
      branchId,
      requestedAmount: 500,
      packageId: pkg.id,
      serviceCode: 'CONSULT',
    });

    await service.submitPreAuthorization(user(), preAuth.id);
    await service.reviewPreAuthorization(user(), preAuth.id);
    await service.approvePreAuthorization(user(), preAuth.id, {
      approvedAmount: 500,
    });

    const invoice = await prisma.invoice.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        invoiceNumber: `INV-${runId}`,
        status: InvoiceStatus.ISSUED,
        subtotalAmount: new Prisma.Decimal('500'),
        totalAmount: new Prisma.Decimal('500'),
        items: {
          create: {
            hospitalId,
            description: 'Consultation',
            unitPrice: new Prisma.Decimal('500'),
            lineTotal: new Prisma.Decimal('500'),
            taxableAmount: new Prisma.Decimal('500'),
            lineTotalWithTax: new Prisma.Decimal('500'),
          },
        },
      },
    });
    invoiceId = invoice.id;

    const claim = await service.createClaim(user(), {
      patientId,
      policyId: policy.id,
      invoiceId,
      branchId,
      preAuthorizationId: preAuth.id,
      packageId: pkg.id,
    });

    await service.submitClaim(user(), claim.id);

    const job = await prisma.job.findFirst({
      where: {
        hospitalId,
        type: JOB_TYPES.INSURANCE_CLAIM_SUBMIT,
      },
    });
    expect(job).toBeTruthy();

    await submitHandler.handle(job!, { workerId: 'test-worker' });

    const afterSubmit = await prisma.insuranceClaim.findUnique({
      where: { id: claim.id },
    });
    expect(afterSubmit?.externalSubmissionStatus).toBe(
      InsuranceClaimExternalSubmissionStatus.MANUAL_REQUIRED,
    );

    await service.reviewClaim(user(), claim.id);
    const approved = await service.approveClaim(user(), claim.id, {
      approvedAmount: 500,
    });

    expect(approved.patientResponsibility).toBe('100.00');
    expect(approved.payerResponsibility).toBe('400.00');
    expect(approved.status).toBe(InsuranceClaimStatus.APPROVED);

    const updatedInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    expect(updatedInvoice?.insurancePatientResponsibilityAmount?.toFixed(2)).toBe(
      '100.00',
    );
    expect(updatedInvoice?.insurancePayerResponsibilityAmount?.toFixed(2)).toBe(
      '400.00',
    );
  });
});
