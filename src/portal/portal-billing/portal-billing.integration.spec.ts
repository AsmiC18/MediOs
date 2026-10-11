import {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { createNoopReportProjectionBillingHook } from '../../reports/report-projection.test-util';
import { toStaffJwtUser } from '../../auth/staff-jwt-payload.util';
import { BillingService } from '../../billing/billing.service';
import { InvoiceSplitPayerService } from '../../billing/invoice-split-payer.service';
import { PaymentsService } from '../../billing/payments.service';
import { RefundsService } from '../../billing/refunds.service';
import { RazorpayService } from '../../billing/razorpay.service';
import { canonicalizePatientPhone } from '../../common/utils/phone.util';
import { toPatientPrincipal } from '../portal-auth/portal-jwt-payload.util';
import { PortalPrincipalGuard } from '../portal-auth/guards/portal-principal.guard';
import { PATIENT_PRINCIPAL_TYPE, PatientPrincipal } from '../portal.types';
import { PortalBillingService } from './portal-billing.service';

const SENSITIVE_KEYS = [
  'passwordHash',
  'storageKey',
  'linkToken',
  'refreshToken',
  'accessToken',
  'providerPaymentLinkId',
  'providerPaymentId',
  'providerOrderId',
  'webhook',
  'RAZORPAY',
  'accessToken',
];

function assertNoSensitiveFields(value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveFields);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      expect(SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s.toLowerCase()))).toBe(
        false,
      );
      assertNoSensitiveFields(nested);
    }
  }
}

describe('Patient portal billing integration', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let otherHospitalId: string;
  let branchId: string;
  let staffUserId: string;
  let staffRoleId: string;

  let patientAId: string;
  let patientBId: string;
  let invoiceAId: string;
  let invoiceBId: string;
  let otherHospitalInvoiceId: string;
  let paymentAId: string;
  let paymentBId: string;

  let portalBilling: PortalBillingService;
  let billingService: BillingService;
  let paymentsService: PaymentsService;
  let razorpayMock: { createPaymentLink: jest.Mock };
  let portalPrincipalGuard: PortalPrincipalGuard;

  const principalA = (): PatientPrincipal => ({
    principalType: PATIENT_PRINCIPAL_TYPE,
    patientId: patientAId,
    hospitalId,
    branchId,
  });

  const staffUser = () => ({
    sub: staffUserId,
    hospitalId,
    branchId: null as string | null,
    roleId: staffRoleId,
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
    billingService = new BillingService(
      prisma as never,
      audit,
      createNoopReportProjectionBillingHook(),
    );
    razorpayMock = {
      createPaymentLink: jest.fn().mockResolvedValue({
        providerPaymentLinkId: `plink_portal_${runId}`,
        paymentLinkUrl: 'https://rzp.io/i/portal-test',
      }),
    };
    const splitPayer = new InvoiceSplitPayerService(prisma as never, audit);
    const refundsService = new RefundsService(
      prisma as never,
      audit,
      razorpayMock as unknown as RazorpayService,
      splitPayer,
    );
    paymentsService = new PaymentsService(
      prisma as never,
      audit,
      razorpayMock as unknown as RazorpayService,
      refundsService,
      splitPayer,
    );
    portalBilling = new PortalBillingService(
      prisma as never,
      paymentsService,
      audit,
    );
    portalPrincipalGuard = new PortalPrincipalGuard(prisma as never);

    const hospital = await prisma.hospital.create({
      data: { name: `PB4 ${runId}`, code: `PB4-${runId}` },
    });
    hospitalId = hospital.id;

    const otherHospital = await prisma.hospital.create({
      data: { name: `PB4O ${runId}`, code: `PB4O-${runId}` },
    });
    otherHospitalId = otherHospital.id;

    branchId = (
      await prisma.branch.create({
        data: { hospitalId, name: 'Main', code: `PB4B-${runId}` },
      })
    ).id;

    staffRoleId = (
      await prisma.role.create({
        data: { hospitalId, name: `PB4R-${runId}` },
      })
    ).id;

    staffUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          branchId,
          roleId: staffRoleId,
          name: 'Billing Staff',
          email: `pb4-${runId}@example.com`,
          passwordHash: 'hash',
        },
      })
    ).id;

    patientAId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'PayA',
          lastName: runId,
          phone: canonicalizePatientPhone(`9${runId.replace(/\D/g, '').slice(-9)}`),
        },
      })
    ).id;

    patientBId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'PayB',
          lastName: runId,
          phone: canonicalizePatientPhone(`8${runId.replace(/\D/g, '').slice(-9)}`),
        },
      })
    ).id;

    const otherPatient = await prisma.patient.create({
      data: {
        hospitalId: otherHospitalId,
        firstName: 'Other',
        lastName: runId,
        phone: canonicalizePatientPhone(`7${runId.replace(/\D/g, '').slice(-9)}`),
      },
    });

    await prisma.patientPortalAccount.create({
      data: {
        patientId: patientAId,
        hospitalId,
        passwordHash: '$2b$12$portalbillingtesthash000000000',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    invoiceAId = (
      await prisma.invoice.create({
        data: {
          hospitalId,
          branchId,
          patientId: patientAId,
          invoiceNumber: `INV-A-${runId}`,
          status: InvoiceStatus.ISSUED,
          subtotalAmount: new Prisma.Decimal(400),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(400),
          currency: 'INR',
          issuedAt: new Date(),
          items: {
            create: [
              {
                hospitalId,
                description: 'Consultation',
                quantity: 1,
                unitPrice: new Prisma.Decimal(400),
                lineTotal: new Prisma.Decimal(400),
                taxableAmount: new Prisma.Decimal(400),
                lineTotalWithTax: new Prisma.Decimal(400),
              },
            ],
          },
        },
      })
    ).id;

    invoiceBId = (
      await prisma.invoice.create({
        data: {
          hospitalId,
          branchId,
          patientId: patientBId,
          invoiceNumber: `INV-B-${runId}`,
          status: InvoiceStatus.ISSUED,
          subtotalAmount: new Prisma.Decimal(200),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(200),
          currency: 'INR',
          issuedAt: new Date(),
        },
      })
    ).id;

    otherHospitalInvoiceId = (
      await prisma.invoice.create({
        data: {
          hospitalId: otherHospitalId,
          patientId: otherPatient.id,
          invoiceNumber: `INV-O-${runId}`,
          status: InvoiceStatus.ISSUED,
          subtotalAmount: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(100),
          currency: 'INR',
        },
      })
    ).id;

    paymentAId = (
      await prisma.payment.create({
        data: {
          hospitalId,
          branchId,
          invoiceId: invoiceAId,
          amount: new Prisma.Decimal(100),
          currency: 'INR',
          provider: PaymentProvider.RAZORPAY,
          status: PaymentStatus.SUCCEEDED,
          paidAt: new Date(),
        },
      })
    ).id;

    paymentBId = (
      await prisma.payment.create({
        data: {
          hospitalId,
          branchId,
          invoiceId: invoiceBId,
          amount: new Prisma.Decimal(50),
          currency: 'INR',
          provider: PaymentProvider.RAZORPAY,
          status: PaymentStatus.SUCCEEDED,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (!dbAvailable || !hospitalId) {
      return;
    }
    await prisma.hospital.deleteMany({
      where: { id: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.$disconnect();
  });

  const itDb = (
    name: string,
    fn: () => Promise<void>,
    timeoutMs?: number,
  ) => {
    it(
      name,
      async () => {
        if (!dbAvailable) {
          return;
        }
        await fn();
      },
      timeoutMs,
    );
  };

  itDb('lists and details own invoices with pagination', async () => {
    const list = await portalBilling.listInvoices(principalA(), { limit: 50 });
    expect(list.data.some((row) => row.id === invoiceAId)).toBe(true);
    expect(list.data.every((row) => row.id !== invoiceBId)).toBe(true);
    assertNoSensitiveFields(list);

    const paged = await portalBilling.listInvoices(principalA(), { page: 1, limit: 1 });
    expect(paged.meta.limit).toBe(1);
    expect(paged.data).toHaveLength(1);

    const detail = await portalBilling.getInvoice(principalA(), invoiceAId);
    expect(detail.id).toBe(invoiceAId);
    expect(detail.items.length).toBeGreaterThan(0);
    expect(detail.paidAmount).toBe('100.00');
    assertNoSensitiveFields(detail);
  });

  itDb('returns 404 for another patient or cross-hospital invoice', async () => {
    await expect(
      portalBilling.getInvoice(principalA(), invoiceBId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      portalBilling.getInvoice(principalA(), otherHospitalInvoiceId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itDb('allows viewing own payment only', async () => {
    const payment = await portalBilling.getPayment(principalA(), paymentAId);
    expect(payment.invoiceId).toBe(invoiceAId);
    assertNoSensitiveFields(payment);

    await expect(
      portalBilling.getPayment(principalA(), paymentBId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itDb('initiates payment for own payable invoice without client overrides', async () => {
    const payInvoice = await prisma.invoice.create({
      data: {
        hospitalId,
        branchId,
        patientId: patientAId,
        invoiceNumber: `INV-PAY-${runId}`,
        status: InvoiceStatus.ISSUED,
        subtotalAmount: new Prisma.Decimal(400),
        taxAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(400),
        currency: 'INR',
        issuedAt: new Date(),
      },
    });

    const result = await portalBilling.initiateInvoicePayment(
      principalA(),
      payInvoice.id,
    );
    expect(result.paymentLinkUrl).toBe('https://rzp.io/i/portal-test');
    expect(result.amount).toBe('400.00');
    assertNoSensitiveFields(result);
    expect(JSON.stringify(result)).not.toContain('plink_portal');

    await expect(
      portalBilling.initiateInvoicePayment(principalA(), invoiceBId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itDb(
    'rejects unpayable invoice and concurrent in-flight initiation',
    async () => {
      const draftInvoice = await prisma.invoice.create({
        data: {
          hospitalId,
          branchId,
          patientId: patientAId,
          invoiceNumber: `INV-DRAFT-${runId}`,
          status: InvoiceStatus.DRAFT,
          subtotalAmount: new Prisma.Decimal(50),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(50),
          currency: 'INR',
        },
      });

      await expect(
        portalBilling.initiateInvoicePayment(principalA(), draftInvoice.id),
      ).rejects.toThrow();

      const raceInvoice = await prisma.invoice.create({
        data: {
          hospitalId,
          branchId,
          patientId: patientAId,
          invoiceNumber: `INV-RACE-${runId}`,
          status: InvoiceStatus.ISSUED,
          subtotalAmount: new Prisma.Decimal(300),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(300),
          currency: 'INR',
          issuedAt: new Date(),
        },
      });

      const razorpayCallsBefore = razorpayMock.createPaymentLink.mock.calls.length;

      let releaseRazorpay!: () => void;
      const holdRazorpay = new Promise<void>((resolve) => {
        releaseRazorpay = resolve;
      });
      razorpayMock.createPaymentLink.mockImplementationOnce(async () => {
        await holdRazorpay;
        return {
          providerPaymentLinkId: `plink_concurrent_${runId}`,
          paymentLinkUrl: 'https://rzp.io/i/concurrent',
        };
      });

      const first = portalBilling.initiateInvoicePayment(
        principalA(),
        raceInvoice.id,
      );

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const created = await prisma.payment.count({
          where: {
            invoiceId: raceInvoice.id,
            status: PaymentStatus.INITIATED,
          },
        });
        if (created > 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      await expect(
        portalBilling.initiateInvoicePayment(principalA(), raceInvoice.id),
      ).rejects.toBeInstanceOf(ConflictException);

      releaseRazorpay();
      await first;

      const inFlight = await prisma.payment.count({
        where: {
          invoiceId: raceInvoice.id,
          status: {
            in: [
              PaymentStatus.INITIATED,
              PaymentStatus.PENDING,
              PaymentStatus.SUBMIT_UNCERTAIN,
            ],
          },
        },
      });
      expect(inFlight).toBe(1);
      expect(
        razorpayMock.createPaymentLink.mock.calls.length - razorpayCallsBefore,
      ).toBe(1);
    },
    15000,
  );

  itDb('preserves staff billing and JWT separation', async () => {
    const staffInvoices = await billingService.findAll(staffUser(), {
      patientId: patientAId,
    });
    expect(staffInvoices.data.some((row) => row.id === invoiceAId)).toBe(true);

    expect(() =>
      toPatientPrincipal({
        principalType: 'STAFF',
        sub: staffUserId,
        hospitalId,
        roleId: staffRoleId,
      } as never),
    ).toThrow(UnauthorizedException);

    expect(() =>
      toStaffJwtUser({
        principalType: PATIENT_PRINCIPAL_TYPE,
        sub: patientAId,
        hospitalId,
        branchId,
      }),
    ).toThrow(UnauthorizedException);
  });

  itDb('rejects anonymized patient via portal guard', async () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: principalA() }),
      }),
    };
    await expect(portalPrincipalGuard.canActivate(ctx as never)).resolves.toBe(true);

    await prisma.patient.update({
      where: { id: patientAId },
      data: { anonymizedAt: new Date() },
    });
    await expect(portalPrincipalGuard.canActivate(ctx as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await prisma.patient.update({
      where: { id: patientAId },
      data: { anonymizedAt: null },
    });
  });
});
