import { Injectable, Logger } from '@nestjs/common';
import { InsuranceClaimStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { roundMoney } from '../billing/utils/money.util';
import { PrismaService } from '../common/prisma/prisma.service';

export type InsuranceReconciliationFinding = {
  claimId: string;
  claimNumber: string;
  issue: 'APPROVED_VS_PAYER_MISMATCH' | 'PAID_VS_RECORDED_MISMATCH';
  approvedAmount: string | null;
  payerResponsibility: string;
  paidAmount: string;
};

@Injectable()
export class InsuranceReconciliationService {
  private readonly logger = new Logger(InsuranceReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async runInternalReconciliation(input: {
    hospitalId: string;
    branchId?: string | null;
    jobId: string;
    workerId: string;
  }): Promise<{ findingCount: number; findings: InsuranceReconciliationFinding[] }> {
    const claims = await this.prisma.insuranceClaim.findMany({
      where: {
        hospitalId: input.hospitalId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        status: {
          in: [
            InsuranceClaimStatus.APPROVED,
            InsuranceClaimStatus.PARTIALLY_APPROVED,
            InsuranceClaimStatus.PAID,
          ],
        },
      },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        approvedAmount: true,
        payerResponsibility: true,
        patientResponsibility: true,
        paidAmount: true,
      },
    });

    const findings: InsuranceReconciliationFinding[] = [];

    for (const claim of claims) {
      if (claim.approvedAmount != null) {
        const approved = roundMoney(claim.approvedAmount);
        const payer = roundMoney(claim.payerResponsibility);
        const patient = roundMoney(claim.patientResponsibility);
        const sum = roundMoney(payer.plus(patient));
        if (!sum.equals(approved)) {
          findings.push({
            claimId: claim.id,
            claimNumber: claim.claimNumber,
            issue: 'APPROVED_VS_PAYER_MISMATCH',
            approvedAmount: approved.toFixed(2),
            payerResponsibility: payer.toFixed(2),
            paidAmount: roundMoney(claim.paidAmount).toFixed(2),
          });
        }
      }

      if (
        claim.status === InsuranceClaimStatus.PAID &&
        claim.approvedAmount != null &&
        !roundMoney(claim.paidAmount).equals(roundMoney(claim.payerResponsibility))
      ) {
        findings.push({
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          issue: 'PAID_VS_RECORDED_MISMATCH',
          approvedAmount: claim.approvedAmount
            ? roundMoney(claim.approvedAmount).toFixed(2)
            : null,
          payerResponsibility: roundMoney(claim.payerResponsibility).toFixed(2),
          paidAmount: roundMoney(claim.paidAmount).toFixed(2),
        });
      }
    }

    await this.auditService.log({
      action: 'INSURANCE_RECONCILIATION_COMPLETED',
      entity: 'InsuranceClaim',
      entityId: input.hospitalId,
      hospitalId: input.hospitalId,
      branchId: input.branchId ?? null,
      userId: null,
      metadata: {
        jobId: input.jobId,
        workerId: input.workerId,
        findingCount: findings.length,
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'insurance_reconciliation_completed',
        hospitalId: input.hospitalId,
        findingCount: findings.length,
      }),
    );

    return { findingCount: findings.length, findings };
  }
}
