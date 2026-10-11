import {
  InsuranceClaimStatus,
  InsuranceProviderType,
  InvoiceStatus,
  PaymentPayerType,
  PaymentProvider,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { InsuranceService } from '../insurance/insurance.service';
import { InsuranceRateResolverService } from '../insurance/insurance-rate-resolver.service';
import { JobService } from '../jobs/job.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { RazorpayService } from './razorpay.service';
describe('Split-payer billing integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let userId: string;
  let patientId: string;
  let invoiceId: string;
  let claimId: string;

  let splitPayer: InvoiceSplitPayerService;
  let insuranceService: InsuranceService;
  let paymentsService: PaymentsService;

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
      return;
    }

    const audit = new AuditService(prisma as never);
    splitPayer = new InvoiceSplitPayerService(prisma as never, audit);
    const jobService = new JobService(prisma as never);
    insuranceService = new InsuranceService(
      prisma as never,
      audit,
      jobService,
      new InsuranceRateResolverService(prisma as never),
      splitPayer,
      new DomainEventOutboxService(prisma as never, jobService),
    );

    const razorpayMock = {
      createPaymentLink: jest.fn().mockResolvedValue({
        providerPaymentLinkId: `plink_sp_${runId}`,
        paymentLinkUrl: 'https://example.com/pay',
      }),
    };
    const refundsService = new RefundsService(
      prisma as never,
      audit,
      razorpayMock as never,
      splitPayer,
    );
    paymentsService = new PaymentsService(
      prisma as never,
      audit,
      razorpayMock as never,
      refundsService,
      splitPayer,
    );

    const hospital = await prisma.hospital.create({
      data: { name: `SP ${runId}`, code: `SP-${runId}` },
    });
    hospitalId = hospital.id;

    userId = (
      await prisma.user.create({
        data: {
          hospitalId,
          roleId: (
            await prisma.role.create({
              data: { hospitalId, name: `SP-R-${runId}` },
            })
          ).id,
          name: 'Split Payer',
          email: `sp-${runId}@test.com`,
          passwordHash: 'hash',
        },
      })
    ).id;

    patientId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          phone: `9${runId.slice(-9)}1`,
          firstName: 'Split',
        },
      })
    ).id;

    const invoice = await prisma.invoice.create({
      data: {
        hospitalId,
        patientId,
        invoiceNumber: `INV-SP-${runId}`,
        status: InvoiceStatus.ISSUED,
        subtotalAmount: 10000,
        taxAmount: 0,
        totalAmount: 10000,
        issuedAt: new Date(),
        insurancePatientResponsibilityAmount: 3000,
        insurancePayerResponsibilityAmount: 7000,
      },
    });
    invoiceId = invoice.id;

    const provider = await prisma.insuranceProvider.create({
      data: {
        hospitalId,
        name: `Prov ${runId}`,
        providerType: InsuranceProviderType.TPA,
      },
    });

    const policy = await prisma.patientInsurancePolicy.create({
      data: {
        hospitalId,
        patientId,
        providerId: provider.id,
        policyNumber: `POL-${runId}`,
      },
    });

    const claim = await prisma.insuranceClaim.create({
      data: {
        hospitalId,
        patientId,
        policyId: policy.id,
        providerId: provider.id,
        invoiceId,
        claimNumber: `CLM-${runId}`,
        claimedAmount: 10000,
        approvedAmount: 7000,
        patientResponsibility: 3000,
        payerResponsibility: 7000,
        status: InsuranceClaimStatus.APPROVED,
        approvedAt: new Date(),
      },
    });
    claimId = claim.id;
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

  itDb('records insurer and patient payments separately', async () => {
    await insuranceService.recordClaimPayment(user(), claimId, {
      paidAmount: 5000,
      idempotencyKey: `settle-a-${runId}`,
    });

    await prisma.payment.create({
      data: {
        hospitalId,
        invoiceId,
        amount: 3000,
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        payerType: PaymentPayerType.PATIENT,
        status: PaymentStatus.SUCCEEDED,
        paidAt: new Date(),
      },
    });

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const balances = await splitPayer.computeBalancesForInvoice(invoice);

    expect(balances.insurerPaid.toFixed(2)).toBe('5000.00');
    expect(balances.patientPaid.toFixed(2)).toBe('3000.00');
    expect(balances.insurerOutstanding.toFixed(2)).toBe('2000.00');
    expect(balances.patientOutstanding.toFixed(2)).toBe('0.00');
    expect(balances.totalOutstanding.toFixed(2)).toBe('2000.00');
    expect(invoice.status).toBe(InvoiceStatus.ISSUED);
  });

  itDb('marks invoice paid only after insurer completes settlement', async () => {
    await insuranceService.recordClaimPayment(user(), claimId, {
      paidAmount: 2000,
      idempotencyKey: `settle-b-${runId}`,
    });

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.status).toBe(InvoiceStatus.PAID);
  });

  itDb('patient initiation uses remaining patient responsibility only', async () => {
    const hospital2 = await prisma.hospital.create({
      data: { name: `SP2 ${runId}`, code: `SP2-${runId}` },
    });
    const patient2 = await prisma.patient.create({
      data: {
        hospitalId: hospital2.id,
        phone: `9${runId.slice(-9)}9`,
        firstName: 'Pat2',
      },
    });
    const inv2 = await prisma.invoice.create({
      data: {
        hospitalId: hospital2.id,
        patientId: patient2.id,
        invoiceNumber: `INV2-${runId}`,
        status: InvoiceStatus.ISSUED,
        subtotalAmount: 1000,
        taxAmount: 0,
        totalAmount: 1000,
        insurancePatientResponsibilityAmount: 250,
        insurancePayerResponsibilityAmount: 750,
        issuedAt: new Date(),
      },
    });

    const staffUser = {
      sub: userId,
      hospitalId: hospital2.id,
      branchId: null,
    };

    const initiated = await paymentsService.initiatePayment(staffUser, inv2.id);
    expect(initiated.amount).toBe('250.00');
  });
});
