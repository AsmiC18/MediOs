import { NotFoundException } from '@nestjs/common';

import { AbhaLinkStatus } from '@prisma/client';

import { AuditService } from '../audit/audit.service';

import { PrismaService } from '../common/prisma/prisma.service';

import { AbdmCallbackService } from './abdm-callback.service';

import { AbdmCallbackValidationService } from './abdm-callback-validation.service';

import { AbdmEnvironmentService } from './abdm-environment.service';



describe('AbdmCallbackService', () => {

  const linkId = 'link-1';

  const patientId = 'patient-1';

  const hospitalId = '11111111-1111-4111-8111-111111111111';

  const hospitalB = '22222222-2222-4222-8222-222222222222';

  const requestId = 'req-callback-1';



  const pendingLink = {

    id: linkId,

    hospitalId,

    patientId,

    abdmRequestId: requestId,

    linkStatus: AbhaLinkStatus.LINK_PENDING,

    abhaNumber: '12345678901234',

    abhaAddress: 'user@abdm',

  };



  const validBody = {

    linkToken: 'header.payload.signature',

    response: { requestId },

  };



  let prisma: {

    patientAbhaLink: {

      findFirst: jest.Mock;

      findMany: jest.Mock;

      updateMany: jest.Mock;

      findUnique: jest.Mock;

    };

    abdmHospitalConfig: { findMany: jest.Mock };

    patient: { update: jest.Mock };

    $transaction: jest.Mock;

  };

  let auditService: { log: jest.Mock };

  let service: AbdmCallbackService;



  beforeEach(() => {

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    prisma = {

      patientAbhaLink: {

        findFirst: jest.fn(),

        findMany: jest.fn(),

        updateMany: jest.fn(),

        findUnique: jest.fn(),

      },

      abdmHospitalConfig: { findMany: jest.fn().mockResolvedValue([]) },

      patient: { update: jest.fn() },

      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>

        fn(prisma),

      ),

    };

    service = new AbdmCallbackService(

      prisma as unknown as PrismaService,

      auditService as unknown as AuditService,

      new AbdmCallbackValidationService(),

      { isMockMode: () => false } as unknown as AbdmEnvironmentService,

      {
        encrypt: (value: string | null | undefined) => value ?? null,
        decrypt: (value: string | null | undefined) => value ?? null,
      } as never,

    );

  });



  function mockSingleHospitalCorrelation() {

    prisma.patientAbhaLink.findMany.mockResolvedValue([

      {

        hospitalId,

        linkStatus: AbhaLinkStatus.LINK_PENDING,

      },

    ]);

  }



  it('links on first valid callback and writes audit once', async () => {

    mockSingleHospitalCorrelation();

    prisma.patientAbhaLink.findFirst.mockResolvedValue(pendingLink);

    prisma.patientAbhaLink.updateMany.mockResolvedValue({ count: 1 });

    prisma.patient.update.mockResolvedValue({});



    const result = await service.handleGenerateTokenCallback(validBody);



    expect(result).toEqual({ status: 'linked' });

    expect(prisma.patientAbhaLink.findFirst).toHaveBeenCalledWith(

      expect.objectContaining({

        where: { hospitalId, abdmRequestId: requestId },

      }),

    );

    expect(prisma.patientAbhaLink.updateMany).toHaveBeenCalledWith(

      expect.objectContaining({

        where: {

          id: linkId,

          hospitalId,

          abdmRequestId: requestId,

          linkStatus: AbhaLinkStatus.LINK_PENDING,

        },

      }),

    );

    expect(auditService.log).toHaveBeenCalledTimes(1);

    expect(auditService.log.mock.calls[0][0].action).toBe('ABHA_LINKED');

    expect(auditService.log.mock.calls[0][0].metadata).not.toHaveProperty(

      'linkToken',

    );

  });



  it('resolves hospital from X-HIP-ID when two hospitals share requestId', async () => {

    prisma.abdmHospitalConfig.findMany.mockResolvedValue([{ hospitalId }]);

    prisma.patientAbhaLink.findMany.mockResolvedValue([

      { hospitalId, linkStatus: AbhaLinkStatus.LINK_PENDING },

      { hospitalId: hospitalB, linkStatus: AbhaLinkStatus.LINK_PENDING },

    ]);

    prisma.patientAbhaLink.findFirst.mockResolvedValue(pendingLink);

    prisma.patientAbhaLink.updateMany.mockResolvedValue({ count: 1 });

    prisma.patient.update.mockResolvedValue({});



    const result = await service.handleGenerateTokenCallback(validBody, {

      hipId: 'hip-hospital-a',

    });



    expect(result).toEqual({ status: 'linked' });

    expect(prisma.patientAbhaLink.findFirst).toHaveBeenCalledWith(

      expect.objectContaining({

        where: { hospitalId, abdmRequestId: requestId },

      }),

    );

  });



  it('does not cross-update when requestId collides across hospitals without HIP ID', async () => {

    prisma.patientAbhaLink.findMany.mockResolvedValue([

      { hospitalId, linkStatus: AbhaLinkStatus.LINK_PENDING },

      { hospitalId: hospitalB, linkStatus: AbhaLinkStatus.LINK_PENDING },

    ]);



    await expect(

      service.handleGenerateTokenCallback(validBody),

    ).rejects.toThrow(NotFoundException);

    expect(prisma.patientAbhaLink.findFirst).not.toHaveBeenCalled();

    expect(prisma.patientAbhaLink.updateMany).not.toHaveBeenCalled();

  });



  it('returns already_linked without audit when status is LINKED', async () => {

    mockSingleHospitalCorrelation();

    prisma.patientAbhaLink.findFirst.mockResolvedValue({

      ...pendingLink,

      linkStatus: AbhaLinkStatus.LINKED,

    });



    const result = await service.handleGenerateTokenCallback(validBody);



    expect(result).toEqual({ status: 'already_linked' });

    expect(auditService.log).not.toHaveBeenCalled();

    expect(prisma.$transaction).not.toHaveBeenCalled();

  });



  it('is idempotent when concurrent callback loses updateMany race', async () => {

    mockSingleHospitalCorrelation();

    prisma.patientAbhaLink.findFirst.mockResolvedValue(pendingLink);

    prisma.patientAbhaLink.updateMany.mockResolvedValue({ count: 0 });

    prisma.patientAbhaLink.findUnique.mockResolvedValue({

      ...pendingLink,

      linkStatus: AbhaLinkStatus.LINKED,

    });



    const result = await service.handleGenerateTokenCallback(validBody);



    expect(result).toEqual({ status: 'already_linked' });

    expect(auditService.log).not.toHaveBeenCalled();

    expect(prisma.patient.update).not.toHaveBeenCalled();

  });



  it('throws for unknown requestId', async () => {

    prisma.patientAbhaLink.findMany.mockResolvedValue([]);



    await expect(

      service.handleGenerateTokenCallback(validBody),

    ).rejects.toThrow(NotFoundException);

    expect(prisma.patientAbhaLink.findFirst).not.toHaveBeenCalled();

  });



  it('does not log linkToken in audit metadata', async () => {

    mockSingleHospitalCorrelation();

    prisma.patientAbhaLink.findFirst.mockResolvedValue(pendingLink);

    prisma.patientAbhaLink.updateMany.mockResolvedValue({ count: 1 });

    prisma.patient.update.mockResolvedValue({});



    await service.handleGenerateTokenCallback(validBody);



    const auditPayload = auditService.log.mock.calls[0][0];

    expect(JSON.stringify(auditPayload)).not.toContain('header.payload.signature');

  });

});


