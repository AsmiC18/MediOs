import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AbhaLinkStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import * as branchScope from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { AbdmGatewayService } from './abdm-gateway.service';
import { AbdmLinkTokenService } from './abdm-link-token.service';
import { PatientAbhaService } from './patient-abha.service';

describe('PatientAbhaService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientIdA = 'patient-a';
  const patientIdB = 'patient-b';

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

  const patientBranchA = {
    id: patientIdA,
    hospitalId,
    branchId: branchA,
    abhaId: null,
    firstName: 'A',
    lastName: 'Patient',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'MALE',
  };

  const patientBranchB = {
    id: patientIdB,
    hospitalId,
    branchId: branchB,
    abhaId: null,
    firstName: 'B',
    lastName: 'Patient',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'FEMALE',
  };

  let prisma: {
    patient: { findUnique: jest.Mock; update: jest.Mock };
    patientAbhaLink: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    abdmHospitalConfig: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let gatewayService: { verifyAbha: jest.Mock };
  let linkTokenService: { requestDemographicLinkToken: jest.Mock };
  let environmentService: {
    getDefaultHipId: jest.Mock;
    isMockMode: jest.Mock;
  };
  let service: PatientAbhaService;

  beforeEach(() => {
    jest.spyOn(branchScope, 'assertBranchAccess');

    prisma = {
      patient: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      patientAbhaLink: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      abdmHospitalConfig: {
        findUnique: jest.fn().mockResolvedValue({ hipId: 'hip-1' }),
      },
      $transaction: jest.fn((fn) =>
        fn({
          patientAbhaLink: prisma.patientAbhaLink,
          patient: prisma.patient,
        }),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    gatewayService = {
      verifyAbha: jest.fn().mockResolvedValue({ verified: true }),
    };
    linkTokenService = {
      requestDemographicLinkToken: jest.fn().mockResolvedValue({
        requestId: 'req-1',
        transactionId: 'txn-1',
      }),
    };
    environmentService = {
      getDefaultHipId: jest.fn().mockReturnValue('hip-default'),
      isMockMode: jest.fn().mockReturnValue(false),
    };

    service = new PatientAbhaService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      gatewayService as unknown as AbdmGatewayService,
      linkTokenService as unknown as AbdmLinkTokenService,
      environmentService as unknown as AbdmEnvironmentService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getAbhaLink', () => {
    it('allows branch user to read own-branch patient ABHA data', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchA);
      prisma.patientAbhaLink.findUnique.mockResolvedValue(null);

      const result = await service.getAbhaLink(branchUser, patientIdA);

      expect(result.patientId).toBe(patientIdA);
      expect(branchScope.assertBranchAccess).toHaveBeenCalledWith(
        branchUser,
        branchA,
      );
    });

    it('denies cross-branch ABHA read', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchB);

      await expect(service.getAbhaLink(branchUser, patientIdB)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.patientAbhaLink.findUnique).not.toHaveBeenCalled();
    });

    it('allows hospital-wide user to read another branch patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchB);
      prisma.patientAbhaLink.findUnique.mockResolvedValue(null);

      await service.getAbhaLink(hospitalWideUser, patientIdB);

      expect(prisma.patientAbhaLink.findUnique).toHaveBeenCalled();
    });

    it('preserves cross-hospital denial as not found', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        ...patientBranchA,
        hospitalId: otherHospitalId,
      });

      await expect(
        service.getAbhaLink(branchUser, patientIdA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('linkAbha', () => {
    const linkDto = { abhaNumber: '12345678901234' };

    it('allows branch user to link own-branch patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchA);
      prisma.patientAbhaLink.upsert.mockResolvedValue({ id: 'link-1' });
      prisma.patientAbhaLink.update.mockResolvedValue({ id: 'link-1' });
      prisma.patientAbhaLink.findUnique.mockResolvedValue({
        id: 'link-1',
        patientId: patientIdA,
        linkStatus: AbhaLinkStatus.LINK_PENDING,
      });

      await service.linkAbha(branchUser, patientIdA, linkDto);

      expect(prisma.patientAbhaLink.upsert).toHaveBeenCalled();
    });

    it('denies cross-branch ABHA link', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchB);

      await expect(
        service.linkAbha(branchUser, patientIdB, linkDto),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.patientAbhaLink.upsert).not.toHaveBeenCalled();
    });
  });

  describe('unlinkAbha', () => {
    it('allows branch user to unlink own-branch patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchA);
      prisma.patientAbhaLink.findUnique.mockResolvedValue({
        id: 'link-1',
        patientId: patientIdA,
      });
      prisma.patientAbhaLink.update.mockResolvedValue({ id: 'link-1' });
      prisma.patient.update.mockResolvedValue({
        ...patientBranchA,
        abhaId: null,
      });

      await service.unlinkAbha(branchUser, patientIdA);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('denies cross-branch unlink', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchB);

      await expect(service.unlinkAbha(branchUser, patientIdB)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('verifyAbha', () => {
    it('denies cross-branch verification', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchB);

      await expect(
        service.verifyAbha(branchUser, patientIdB, {}),
      ).rejects.toThrow(ForbiddenException);

      expect(gatewayService.verifyAbha).not.toHaveBeenCalled();
    });

    it('allows branch user to verify own-branch linked ABHA', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        ...patientBranchA,
        abhaId: '12345678901234',
      });
      prisma.patientAbhaLink.findUnique.mockResolvedValue({
        id: 'link-1',
        linkStatus: AbhaLinkStatus.LINKED,
      });
      prisma.patientAbhaLink.update.mockResolvedValue({
        id: 'link-1',
        linkStatus: AbhaLinkStatus.LINKED,
      });

      await service.verifyAbha(branchUser, patientIdA, {});

      expect(gatewayService.verifyAbha).toHaveBeenCalledWith({
        patientId: patientIdA,
      });
    });

    it('preserves business rule when patient is not linked', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchA);
      prisma.patientAbhaLink.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyAbha(branchUser, patientIdA, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('external callbacks', () => {
    it('keeps ABDM provider callbacks outside PatientAbhaService staff paths', () => {
      expect((service as { handleWebhook?: unknown }).handleWebhook).toBeUndefined();
    });
  });
});
