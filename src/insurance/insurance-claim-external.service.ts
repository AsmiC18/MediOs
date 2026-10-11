import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  InsuranceClaimExternalSubmissionStatus,
  InsuranceClaimStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { InsurancePayerAdapter } from './adapters/insurance-payer.adapter';
import { INSURANCE_PAYER_ADAPTER } from './adapters/insurance-payer.adapter';

@Injectable()
export class InsuranceClaimExternalService {
  private readonly logger = new Logger(InsuranceClaimExternalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(INSURANCE_PAYER_ADAPTER)
    private readonly payerAdapter: InsurancePayerAdapter,
  ) {}

  async processClaimSubmitJob(input: {
    hospitalId: string;
    claimId: string;
    jobId: string;
    workerId: string;
  }): Promise<{ outcome: string }> {
    const claim = await this.prisma.insuranceClaim.findFirst({
      where: { id: input.claimId, hospitalId: input.hospitalId },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found for submit job');
    }

    if (claim.status !== InsuranceClaimStatus.SUBMITTED) {
      this.logger.warn(
        `Skipping claim submit job ${input.jobId}: claim ${claim.id} status=${claim.status}`,
      );
      return { outcome: 'skipped_status' };
    }

    const result = await this.payerAdapter.submitClaim({
      hospitalId: input.hospitalId,
      claimId: claim.id,
      claimNumber: claim.claimNumber,
    });

    if (result.outcome === 'MANUAL_REQUIRED') {
      await this.prisma.insuranceClaim.update({
        where: { id: claim.id },
        data: {
          externalSubmissionStatus: InsuranceClaimExternalSubmissionStatus.MANUAL_REQUIRED,
        },
      });

      await this.auditService.log({
        action: 'INSURANCE_CLAIM_EXTERNAL_MANUAL_REQUIRED',
        entity: 'InsuranceClaim',
        entityId: claim.id,
        hospitalId: claim.hospitalId,
        branchId: claim.branchId,
        userId: null,
        metadata: {
          jobId: input.jobId,
          workerId: input.workerId,
          message: result.message,
        },
      });

      return { outcome: 'MANUAL_REQUIRED' };
    }

    await this.prisma.insuranceClaim.update({
      where: { id: claim.id },
      data: {
        externalSubmissionStatus: InsuranceClaimExternalSubmissionStatus.MANUAL_SUBMITTED,
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_EXTERNAL_SUBMITTED',
      entity: 'InsuranceClaim',
      entityId: claim.id,
      hospitalId: claim.hospitalId,
      branchId: claim.branchId,
      userId: null,
      metadata: {
        jobId: input.jobId,
        workerId: input.workerId,
        externalReference: result.externalReference,
      },
    });

    return { outcome: 'SUBMITTED' };
  }

  async markClaimManuallySubmitted(
    user: { sub: string; hospitalId: string },
    claimId: string,
    input: { notes?: string } = {},
  ) {
    const claim = await this.prisma.insuranceClaim.findFirst({
      where: { id: claimId, hospitalId: user.hospitalId },
    });
    if (!claim) {
      throw new NotFoundException('Insurance claim not found');
    }

    const updated = await this.prisma.insuranceClaim.update({
      where: { id: claimId },
      data: {
        externalSubmissionStatus: InsuranceClaimExternalSubmissionStatus.MANUAL_SUBMITTED,
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_MANUAL_SUBMISSION_RECORDED',
      entity: 'InsuranceClaim',
      entityId: claim.id,
      hospitalId: claim.hospitalId,
      branchId: claim.branchId,
      userId: user.sub,
      metadata: {
        claimNumber: claim.claimNumber,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      },
    });

    return updated;
  }
}
