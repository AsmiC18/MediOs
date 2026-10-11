import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AbhaLinkStatus,
  AbhaVerificationMethod,
  Patient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { AbdmGatewayService } from './abdm-gateway.service';
import { AbdmLinkTokenService } from './abdm-link-token.service';
import { LinkAbhaDto } from './dto/link-abha.dto';
import { VerifyAbhaDto } from './dto/verify-abha.dto';
import {
  maskAbhaForAudit,
  resolveCanonicalAbhaId,
  validateAbhaIdentifiers,
} from './utils/abha-format.util';
import { buildPatientDemographics } from './utils/patient-demographics.util';
import { sanitizePatientAbhaLink } from './utils/link-token-response.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class PatientAbhaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly gatewayService: AbdmGatewayService,
    private readonly linkTokenService: AbdmLinkTokenService,
    private readonly environmentService: AbdmEnvironmentService,
  ) {}

  private async findOwnedPatient(
    user: AuthenticatedUser,
    patientId: string,
  ): Promise<Patient> {
    const patient = await this.prisma.patient.findUnique({
      where: {
        id: patientId,
      },
    });

    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    assertBranchAccess(user, patient.branchId);

    return patient;
  }

  private async resolveHipId(hospitalId: string): Promise<string> {
    const config = await this.prisma.abdmHospitalConfig.findUnique({
      where: { hospitalId },
    });

    const hipId = config?.hipId ?? this.environmentService.getDefaultHipId();

    if (!hipId) {
      throw new BadRequestException(
        'Hospital HIP ID is not configured for ABDM link-token requests',
      );
    }

    return hipId;
  }

  async getAbhaLink(user: AuthenticatedUser, patientId: string) {
    const patient = await this.findOwnedPatient(user, patientId);

    const link = await this.prisma.patientAbhaLink.findUnique({
      where: {
        patientId,
      },
    });

    const safeLink = link ? sanitizePatientAbhaLink(link) : null;

    return {
      patientId,
      abhaId: patient.abhaId,
      link: safeLink ?? {
        hospitalId: user.hospitalId,
        patientId,
        abhaNumber: null,
        abhaAddress: null,
        linkStatus: AbhaLinkStatus.UNLINKED,
        linkedAt: null,
        lastVerifiedAt: null,
        providerReferenceId: null,
        verificationMethod: null,
        linkTokenExpiresAt: null,
        abdmRequestId: null,
        abdmTransactionId: null,
      },
    };
  }

  async linkAbha(
    user: AuthenticatedUser,
    patientId: string,
    dto: LinkAbhaDto,
  ) {
    const patient = await this.findOwnedPatient(user, patientId);

    let identifiers: { abhaNumber?: string; abhaAddress?: string };

    try {
      identifiers = validateAbhaIdentifiers({
        abhaNumber: dto.abhaNumber,
        abhaAddress: dto.abhaAddress,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid ABHA identifiers',
      );
    }

    const demographics = buildPatientDemographics(patient);
    const hipId = await this.resolveHipId(user.hospitalId);
    const canonicalAbhaId = resolveCanonicalAbhaId(identifiers);
    const isMockMode = this.environmentService.isMockMode();

    await this.prisma.patientAbhaLink.upsert({
      where: {
        patientId,
      },
      create: {
        hospitalId: user.hospitalId,
        patientId,
        abhaNumber: identifiers.abhaNumber,
        abhaAddress: identifiers.abhaAddress,
        linkStatus: AbhaLinkStatus.LINK_PENDING,
        verificationMethod: AbhaVerificationMethod.DEMOGRAPHICS,
      },
      update: {
        abhaNumber: identifiers.abhaNumber,
        abhaAddress: identifiers.abhaAddress,
        linkStatus: AbhaLinkStatus.LINK_PENDING,
        verificationMethod: AbhaVerificationMethod.DEMOGRAPHICS,
        linkedAt: null,
        providerReferenceId: null,
        linkToken: null,
        linkTokenExpiresAt: null,
        abdmRequestId: null,
        abdmTransactionId: null,
      },
    });

    let linkTokenResult;

    try {
      linkTokenResult = await this.linkTokenService.requestDemographicLinkToken({
        abhaNumber: identifiers.abhaNumber,
        abhaAddress: identifiers.abhaAddress,
        demographics,
        hipId,
      });
    } catch (error) {
      await this.prisma.patientAbhaLink.update({
        where: { patientId },
        data: { linkStatus: AbhaLinkStatus.VERIFICATION_FAILED },
      });
      throw error;
    }

    await this.prisma.patientAbhaLink.update({
      where: { patientId },
      data: {
        abdmRequestId: linkTokenResult.requestId,
        abdmTransactionId: linkTokenResult.transactionId,
      },
    });

    if (!isMockMode) {
      return {
        status: 'pending',
        requestId: linkTokenResult.requestId,
        link: sanitizePatientAbhaLink(
          (await this.prisma.patientAbhaLink.findUnique({
            where: { patientId },
          })) as Record<string, unknown>,
        ),
      };
    }

    const now = new Date();
    const mockLinkToken = `mock.link.token.${patientId}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const link = await tx.patientAbhaLink.update({
        where: { patientId },
        data: {
          linkStatus: AbhaLinkStatus.LINKED,
          linkedAt: now,
          lastVerifiedAt: now,
          linkToken: mockLinkToken,
          providerReferenceId: linkTokenResult.transactionId,
        },
      });

      const updatedPatient = await tx.patient.update({
        where: { id: patientId },
        data: { abhaId: canonicalAbhaId },
      });

      return { link, patient: updatedPatient };
    });

    await this.auditService.log({
      action: 'ABHA_LINKED',
      entity: 'PatientAbhaLink',
      entityId: result.link.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
      metadata: {
        patientId,
        abhaId: maskAbhaForAudit(canonicalAbhaId),
        requestId: linkTokenResult.requestId,
        mockMode: true,
      },
    });

    return {
      link: sanitizePatientAbhaLink(result.link as Record<string, unknown>),
      abhaId: result.patient.abhaId,
    };
  }

  async unlinkAbha(user: AuthenticatedUser, patientId: string) {
    const patient = await this.findOwnedPatient(user, patientId);

    const existingLink = await this.prisma.patientAbhaLink.findUnique({
      where: {
        patientId,
      },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const link = existingLink
        ? await tx.patientAbhaLink.update({
            where: {
              patientId,
            },
            data: {
              linkStatus: AbhaLinkStatus.REVOKED,
              linkToken: null,
              linkTokenExpiresAt: null,
            },
          })
        : await tx.patientAbhaLink.create({
            data: {
              hospitalId: user.hospitalId,
              patientId,
              linkStatus: AbhaLinkStatus.REVOKED,
            },
          });

      const updatedPatient = await tx.patient.update({
        where: {
          id: patientId,
        },
        data: {
          abhaId: null,
        },
      });

      return { link, patient: updatedPatient };
    });

    await this.auditService.log({
      action: 'ABHA_UNLINKED',
      entity: 'PatientAbhaLink',
      entityId: result.link.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
      metadata: {
        patientId,
      },
    });

    return {
      link: sanitizePatientAbhaLink(result.link as Record<string, unknown>),
      abhaId: result.patient.abhaId,
    };
  }

  async verifyAbha(
    user: AuthenticatedUser,
    patientId: string,
    _dto: VerifyAbhaDto,
  ) {
    const patient = await this.findOwnedPatient(user, patientId);

    const link = await this.prisma.patientAbhaLink.findUnique({
      where: {
        patientId,
      },
    });

    if (!link || link.linkStatus !== AbhaLinkStatus.LINKED) {
      throw new BadRequestException('Patient does not have a linked ABHA');
    }

    const gatewayResult = await this.gatewayService.verifyAbha({ patientId });

    if (!gatewayResult.verified) {
      throw new BadRequestException('ABHA verification failed');
    }

    const now = new Date();

    const updatedLink = await this.prisma.patientAbhaLink.update({
      where: {
        patientId,
      },
      data: {
        lastVerifiedAt: now,
      },
    });

    await this.auditService.log({
      action: 'ABHA_VERIFIED',
      entity: 'PatientAbhaLink',
      entityId: updatedLink.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
      metadata: {
        patientId,
        abhaId: maskAbhaForAudit(patient.abhaId),
      },
    });

    return sanitizePatientAbhaLink(updatedLink as Record<string, unknown>);
  }
}
