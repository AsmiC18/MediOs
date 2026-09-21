import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AbhaLinkStatus,
  AbhaVerificationMethod,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AbdmCallbackValidationService } from './abdm-callback-validation.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { extractLinkTokenExpiry } from './utils/link-token-response.util';

@Injectable()
export class AbdmCallbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly validationService: AbdmCallbackValidationService,
    private readonly environmentService: AbdmEnvironmentService,
  ) {}

  async handleGenerateTokenCallback(body: unknown): Promise<{ status: string }> {
    const parsed = this.validationService.validateGenerateTokenCallback(body);

    const existingLink = await this.prisma.patientAbhaLink.findFirst({
      where: {
        abdmRequestId: parsed.requestId,
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

    const abhaAddress = parsed.abhaAddress ?? existingLink.abhaAddress;

    await this.prisma.$transaction(async (tx) => {
      await tx.patientAbhaLink.update({
        where: { id: existingLink.id },
        data: {
          linkStatus: AbhaLinkStatus.LINKED,
          linkToken: parsed.linkToken,
          linkTokenExpiresAt,
          abhaAddress,
          linkedAt: new Date(),
          lastVerifiedAt: new Date(),
          verificationMethod: AbhaVerificationMethod.DEMOGRAPHICS,
        },
      });

      await tx.patient.update({
        where: { id: existingLink.patientId },
        data: {
          abhaId:
            abhaAddress ??
            existingLink.abhaNumber ??
            existingLink.abhaAddress,
        },
      });
    });

    await this.auditService.log({
      hospitalId: existingLink.hospitalId,
      userId: null,
      action: 'ABHA_LINKED',
      entity: 'PatientAbhaLink',
      entityId: existingLink.id,
      metadata: {
        callbackType: 'on-generate-token',
        requestId: parsed.requestId,
        patientId: existingLink.patientId,
        mockMode: this.environmentService.isMockMode(),
      },
    });

    return { status: 'linked' };
  }
}
