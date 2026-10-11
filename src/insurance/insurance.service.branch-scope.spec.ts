import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  InsuranceClaimStatus,
  InsuranceEmpanelmentStatus,
  InvoiceStatus,
  PatientInsurancePolicyStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { InsuranceService } from './insurance.service';

describe('InsuranceService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientId = 'patient-1';
  const policyId = 'policy-1';
  const claimIdA = 'claim-a';
  const claimIdB = 'claim-b';
  const invoiceId = 'invoice-1';
  const preAuthId = 'preauth-a';

  const branchUser = {
    sub: 'user-branch-a',
    hospitalId,
    branchId: branchA,
  };

  const hospitalWideUser = {
    sub: 'user-hospital-wide',
    hospitalId,
    branchId: null as string | null,
  };

  let prisma: {
    insuranceClaim: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    insurancePreAuthorization: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    patientInsurancePolicy: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    invoice: { findUnique: jest.Mock };
    patient: { findUnique: jest.Mock };
    insuranceProvider: { findUnique: jest.Mock };
    insuranceEmpanelment: { findFirst: jest.Mock; findMany: jest.Mock };
    branch: { findUnique: jest.Mock };
    ipdAdmission: { findUnique: jest.Mock };
    clinicalEncounter: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: InsuranceService;

  const policyRecord = {
    id: policyId,
    hospitalId,
    patientId,
    providerId: 'provider-1',
    empanelmentId: 'emp-1',
    status: PatientInsurancePolicyStatus.ACTIVE,
    provider: { id: 'provider-1', name: 'Insurer' },
    patient: { branchId: branchA },
  };

  const activeProvider = {
    id: 'provider-1',
    hospitalId,
    isActive: true,
  };

  const usableEmpanelment = {
    id: 'emp-1',
    hospitalId,
    providerId: 'provider-1',
    branchId: null,
    status: InsuranceEmpanelmentStatus.ACTIVE,
    effectiveFrom: new Date('2020-01-01'),
    effectiveTo: null,
  };

  const claimA = {
    id: claimIdA,
    hospitalId,
    branchId: branchA,
    patientId,
    policyId,
    providerId: 'provider-1',
    invoiceId,
    claimNumber: 'CLM-000001',
    status: InsuranceClaimStatus.READY,
    claimedAmount: new Prisma.Decimal(1000),
    approvedAmount: null,
    paidAmount: new Prisma.Decimal(0),
    patientResponsibility: new Prisma.Decimal(0),
    payerResponsibility: new Prisma.Decimal(0),
    externalSubmissionStatus: 'NONE',
    submittedAt: null,
    createdAt: new Date(),
    invoice: {},
    policy: {},
    provider: {},
    patient: {},
  };

  beforeEach(() => {
    prisma = {
      insuranceClaim: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      insurancePreAuthorization: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      patientInsurancePolicy: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      invoice: { findUnique: jest.fn() },
      patient: { findUnique: jest.fn() },
      insuranceProvider: {
        findUnique: jest.fn().mockResolvedValue(activeProvider),
      },
      insuranceEmpanelment: {
        findFirst: jest.fn().mockResolvedValue(usableEmpanelment),
        findMany: jest.fn().mockResolvedValue([usableEmpanelment]),
      },
      branch: { findUnique: jest.fn() },
      ipdAdmission: { findUnique: jest.fn() },
      clinicalEncounter: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          insuranceClaim: prisma.insuranceClaim,
        }),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new InsuranceService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      { enqueue: jest.fn() } as never,
      { resolveInsuranceRate: jest.fn() } as never,
      { computeBalancesForInvoice: jest.fn(), lockInvoiceForUpdate: jest.fn(), syncInvoiceSettlementStatus: jest.fn() } as never,
      {
        createInTransaction: jest.fn(),
        enqueueDispatchInTransaction: jest.fn(),
      } as never,
    );
  });

  describe('listClaims and listPreAuthorizations', () => {
    it('scopes branch user claim list to JWT branch', async () => {
      await service.listClaims(branchUser, {});

      const where = prisma.insuranceClaim.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
    });

    it('allows hospital-wide user to list claims without branch filter', async () => {
      await service.listClaims(hospitalWideUser, {});

      const where = prisma.insuranceClaim.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });

    it('scopes branch user pre-authorization list to JWT branch', async () => {
      await service.listPreAuthorizations(branchUser, {});

      const where =
        prisma.insurancePreAuthorization.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
    });

    it('scopes branch user policy list via patient branch', async () => {
      await service.listPolicies(branchUser, {});

      const where =
        prisma.patientInsurancePolicy.findMany.mock.calls[0][0].where;
      expect(where.patient).toEqual({ branchId: branchA });
    });
  });

  describe('getClaim and getPolicy', () => {
    it('allows branch user to get own-branch claim', async () => {
      prisma.insuranceClaim.findUnique.mockResolvedValue(claimA);

      const claim = await service.getClaim(branchUser, claimIdA);

      expect(claim.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch claim', async () => {
      prisma.insuranceClaim.findUnique.mockResolvedValue({
        ...claimA,
        id: claimIdB,
        branchId: branchB,
      });

      await expect(service.getClaim(branchUser, claimIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('denies branch user access to policy for patient in another branch', async () => {
      prisma.patientInsurancePolicy.findUnique.mockResolvedValue({
        ...policyRecord,
        patient: { branchId: branchB },
      });

      await expect(service.getPolicy(branchUser, policyId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital claim as not found', async () => {
      prisma.insuranceClaim.findUnique.mockResolvedValue(null);

      await expect(service.getClaim(branchUser, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createClaim', () => {
    beforeEach(() => {
      prisma.insuranceClaim.findFirst.mockResolvedValue(null);
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
        branchId: branchA,
        mergedIntoPatientId: null,
      });
      prisma.patientInsurancePolicy.findUnique.mockResolvedValue(policyRecord);
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        hospitalId,
        patientId,
        branchId: branchA,
        status: InvoiceStatus.ISSUED,
        totalAmount: new Prisma.Decimal(1000),
      });
      prisma.insuranceClaim.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: claimIdA, ...data }),
      );
      prisma.insuranceClaim.findUnique.mockImplementation(({ where }) =>
        Promise.resolve({ ...claimA, id: where.id }),
      );
    });

    it('forces JWT branch for branch-scoped user on claim create', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchA, hospitalId });

      const claim = await service.createClaim(branchUser, {
        patientId,
        policyId,
        invoiceId,
        branchId: branchB,
      });

      expect(claim.branchId).toBe(branchA);
      expect(prisma.insuranceClaim.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('denies branch user creating claim from another branch invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        hospitalId,
        patientId,
        branchId: branchB,
        status: InvoiceStatus.ISSUED,
        totalAmount: new Prisma.Decimal(1000),
      });

      await expect(
        service.createClaim(branchUser, {
          patientId,
          policyId,
          invoiceId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('claim mutations', () => {
    it('denies branch user submitting another branch claim', async () => {
      prisma.insuranceClaim.findUnique.mockResolvedValue({
        ...claimA,
        id: claimIdB,
        branchId: branchB,
      });

      await expect(service.submitClaim(branchUser, claimIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('denies branch user recording payment on another branch claim', async () => {
      prisma.insuranceClaim.findUnique.mockResolvedValue({
        ...claimA,
        id: claimIdB,
        branchId: branchB,
        status: InsuranceClaimStatus.APPROVED,
        approvedAmount: new Prisma.Decimal(500),
      });

      await expect(
        service.recordClaimPayment(branchUser, claimIdB, { paidAmount: 100 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves payment business rule for authorized branch user', async () => {
      prisma.insuranceClaim.findUnique.mockResolvedValue({
        ...claimA,
        status: InsuranceClaimStatus.READY,
      });

      await expect(
        service.recordClaimPayment(branchUser, claimIdA, { paidAmount: 100 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('pre-authorization', () => {
    it('denies branch user access to another branch pre-auth', async () => {
      prisma.insurancePreAuthorization.findUnique.mockResolvedValue({
        id: preAuthId,
        hospitalId,
        branchId: branchB,
        patientId,
        policyId,
        status: 'DRAFT',
      });

      await expect(
        service.getPreAuthorization(branchUser, preAuthId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forces JWT branch on pre-auth create for branch user', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
        branchId: branchA,
        mergedIntoPatientId: null,
      });
      prisma.patientInsurancePolicy.findUnique.mockResolvedValue(policyRecord);
      prisma.branch.findUnique.mockResolvedValue({ id: branchA, hospitalId });
      prisma.insurancePreAuthorization.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: preAuthId, ...data, status: 'DRAFT' }),
      );

      const preAuth = await service.createPreAuthorization(branchUser, {
        patientId,
        policyId,
        requestedAmount: 5000,
        branchId: branchB,
      });

      expect(preAuth.branchId).toBe(branchA);
    });
  });
});
