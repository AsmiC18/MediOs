import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AbhaLinkStatus,
  AbhaVerificationMethod,
} from '@prisma/client';
import { FieldEncryptionService } from '../common/crypto/field-encryption.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AbdmCallbackValidationService } from './abdm-callback-validation.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { resolveCallbackHospitalId } from './utils/callback-hospital-correlation.util';
import { extractLinkTokenExpiry } from './utils/link-token-response.util';

export type GenerateTokenCallbackContext = {
  hipId?: string | null;
};

@Injectable()
export class AbdmCallbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly validationService: AbdmCallbackValidationService,
    private readonly environmentService: AbdmEnvironmentService,
    private readonly fieldEncryptionService: FieldEncryptionService,
  ) {}

  async handleGenerateTokenCallback(
    body: unknown,
    context: GenerateTokenCallbackContext = {},
  ): Promise<{ status: string }> {
    const parsed = this.validationService.validateGenerateTokenCallback(body);
    const requestId = parsed.requestId;

    const hospitalId = await this.resolveTenantHospitalId(
      requestId,
      context.hipId,
    );

    if (!hospitalId) {
      throw new NotFoundException('No pending ABHA link found for callback requestId');
    }

    const existingLink = await this.prisma.patientAbhaLink.findFirst({
      where: {
        hospitalId,
        abdmRequestId: requestId,
      },
      include: {
        patient: true,
      },
    });

    if (!existingLink) {
      throw new NotFoundException('No pending ABHA link found for callback requestId');
    }

    if (existingLink.linkStatus === AbhaLinkStatus.LINKED) {
      return { status: 'already_linked' };
    }

    if (existingLink.linkStatus !== AbhaLinkStatus.LINK_PENDING) {
      throw new NotFoundException('No pending ABHA link found for callback requestId');
    }

    const linkTokenExpiresAt =
      parsed.linkToken ? extractLinkTokenExpiry(parsed.linkToken) : null;
    const storedLinkToken = parsed.linkToken
      ? this.fieldEncryptionService.encrypt(parsed.linkToken)
      : null;

    const abhaAddress = parsed.abhaAddress ?? existingLink.abhaAddress;

    const outcome = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.patientAbhaLink.updateMany({
        where: {
          id: existingLink.id,
          hospitalId,
          abdmRequestId: requestId,
          linkStatus: AbhaLinkStatus.LINK_PENDING,
        },
        data: {
          linkStatus: AbhaLinkStatus.LINKED,
          linkToken: storedLinkToken,
          linkTokenExpiresAt,
          abhaAddress,
          linkedAt: new Date(),
          lastVerifiedAt: new Date(),
          verificationMethod: AbhaVerificationMethod.DEMOGRAPHICS,
        },
      });

      if (updated.count === 0) {
        const current = await tx.patientAbhaLink.findUnique({
          where: { id: existingLink.id },
        });

        if (current?.linkStatus === AbhaLinkStatus.LINKED) {
          return 'already_linked' as const;
        }

        throw new NotFoundException(
          'No pending ABHA link found for callback requestId',
        );
      }

      await tx.patient.update({
        where: { id: existingLink.patientId },
        data: {
          abhaId:
            abhaAddress ??
            existingLink.abhaNumber ??
            existingLink.abhaAddress,
        },
      });

      return 'linked' as const;
    });

    if (outcome === 'already_linked') {
      return { status: 'already_linked' };
    }

    await this.auditService.log({
      hospitalId: existingLink.hospitalId,
      userId: null,
      action: 'ABHA_LINKED',
      entity: 'PatientAbhaLink',
      entityId: existingLink.id,
      metadata: {
        callbackType: 'on-generate-token',
        requestId,
        patientId: existingLink.patientId,
        mockMode: this.environmentService.isMockMode(),
      },
    });

    return { status: 'linked' };
  }

  private async resolveTenantHospitalId(
    requestId: string,
    hipIdHeader?: string | null,
  ): Promise<string | null> {
    const hipId = hipIdHeader?.trim();
    const configsForHipId = hipId
      ? await this.prisma.abdmHospitalConfig.findMany({
          where: { hipId },
          select: { hospitalId: true },
        })
      : [];

    const linksForRequestId = await this.prisma.patientAbhaLink.findMany({
      where: { abdmRequestId: requestId },
      select: { hospitalId: true, linkStatus: true },
    });

    return resolveCallbackHospitalId({
      hipIdHeader: hipId,
      requestId,
      configsForHipId,
      linksForRequestId,
    });
  }
}
