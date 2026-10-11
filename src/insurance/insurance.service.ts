import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InsuranceClaimStatus,
  InsuranceEmpanelmentStatus,
  InsurancePreAuthorizationStatus,
  InvoiceStatus,
  PatientInsurancePolicyStatus,
  PaymentPayerType,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { InvoiceSplitPayerService } from '../billing/invoice-split-payer.service';
import { AuditService } from '../audit/audit.service';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { roundMoney } from '../billing/utils/money.util';
import {
  applyBranchScope,
  assertBranchAccess,
  resolveCreateBranchId,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  ApproveClaimDto,
  ClaimQueryDto,
  CreateClaimDto,
  RecordClaimPaymentDto,
  RejectClaimDto,
} from './dto/claim.dto';
import {
  CreateEmpanelmentDto,
  EmpanelmentQueryDto,
  UpdateEmpanelmentDto,
} from './dto/empanelment.dto';
import {
  CreatePolicyDto,
  PolicyQueryDto,
  UpdatePolicyDto,
} from './dto/policy.dto';
import {
  ApprovePreAuthorizationDto,
  CreatePreAuthorizationDto,
  PreAuthorizationQueryDto,
  RejectPreAuthorizationDto,
} from './dto/preauth.dto';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';
import { InsuranceRateResolverService } from './insurance-rate-resolver.service';
import { parseMoney } from './utils/amount.util';
import { calculateCopaySplit } from './utils/copay.util';
import {
  isAllowedClaimTransition,
  isClaimCancellable,
} from './utils/claim-transitions.util';
import {
  isAllowedPreauthTransition,
  isPreauthCancellable,
} from './utils/preauth-transitions.util';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { buildInsuranceClaimSubmittedDomainEvent } from './insurance-claim-staff-event.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const MAX_CLAIM_NUMBER_RETRIES = 3;

@Injectable()
export class InsuranceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly jobService: JobService,
    private readonly rateResolver: InsuranceRateResolverService,
    private readonly invoiceSplitPayerService: InvoiceSplitPayerService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
  ) {}

  private async validateBranch(user: AuthenticatedUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Branch does not belong to your hospital');
    }
    return branch;
  }

  private async validatePatient(user: AuthenticatedUser, patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }
    if (patient.mergedIntoPatientId) {
      throw new BadRequestException('Patient record is not active');
    }

    assertBranchAccess(user, patient.branchId);

    return patient;
  }

  private async findOwnedProvider(user: AuthenticatedUser, providerId: string) {
    const provider = await this.prisma.insuranceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider || provider.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Insurance provider not found');
    }

    return provider;
  }

  private async findOwnedPolicy(user: AuthenticatedUser, policyId: string) {
    const policy = await this.prisma.patientInsurancePolicy.findUnique({
      where: { id: policyId },
      include: {
        provider: true,
        patient: { select: { branchId: true } },
      },
    });
    if (!policy || policy.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Insurance policy not found');
    }

    assertBranchAccess(user, policy.patient.branchId);

    return policy;
  }

  private async findOwnedPreAuth(user: AuthenticatedUser, id: string) {
    const preAuth = await this.prisma.insurancePreAuthorization.findUnique({
      where: { id },
    });
    if (!preAuth || preAuth.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Pre-authorization not found');
    }

    assertBranchAccess(user, preAuth.branchId);

    return preAuth;
  }

  private async findOwnedClaim(user: AuthenticatedUser, id: string) {
    const claim = await this.prisma.insuranceClaim.findUnique({
      where: { id },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true } },
        policy: { select: { id: true, policyNumber: true, providerId: true } },
        provider: { select: { id: true, name: true, providerType: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!claim || claim.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Insurance claim not found');
    }

    assertBranchAccess(user, claim.branchId);
    return claim;
  }

  private formatClaim(claim: Awaited<ReturnType<InsuranceService['findOwnedClaim']>>) {
    const ageReference = claim.submittedAt ?? claim.createdAt;
    const ageInDays = Math.floor(
      (Date.now() - ageReference.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      ...claim,
      claimedAmount: roundMoney(claim.claimedAmount).toFixed(2),
      approvedAmount: claim.approvedAmount
        ? roundMoney(claim.approvedAmount).toFixed(2)
        : null,
      paidAmount: roundMoney(claim.paidAmount).toFixed(2),
      patientResponsibility: roundMoney(claim.patientResponsibility).toFixed(2),
      payerResponsibility: roundMoney(claim.payerResponsibility).toFixed(2),
      ageInDays,
    };
  }

  private async generateClaimNumber(
    tx: Prisma.TransactionClient,
    hospitalId: string,
  ): Promise<string> {
    const lockKey = `insurance-claim:${hospitalId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const latest = await tx.insuranceClaim.findFirst({
      where: { hospitalId },
      orderBy: { claimNumber: 'desc' },
      select: { claimNumber: true },
    });

    let sequence = 1;
    if (latest?.claimNumber) {
      const match = /^CLM-(\d+)$/.exec(latest.claimNumber);
      if (match) sequence = parseInt(match[1], 10) + 1;
    }

    return `CLM-${String(sequence).padStart(6, '0')}`;
  }

  private async onClaimSubmitted(claimId: string): Promise<void> {
    const claim = await this.prisma.insuranceClaim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      return;
    }

    await this.jobService.enqueue({
      hospitalId: claim.hospitalId,
      branchId: claim.branchId,
      type: JOB_TYPES.INSURANCE_CLAIM_SUBMIT,
      idempotencyKey: `${JOB_TYPES.INSURANCE_CLAIM_SUBMIT}:${claimId}`,
      payload: { claimId },
      maxAttempts: 5,
    });
  }

  // --- Providers ---

  async createProvider(user: AuthenticatedUser, dto: CreateProviderDto) {
    try {
      const provider = await this.prisma.insuranceProvider.create({
        data: {
          hospitalId: user.hospitalId,
          name: dto.name.trim(),
          code: dto.code?.trim() || null,
          providerType: dto.providerType,
          contactName: dto.contactName?.trim(),
          contactPhone: dto.contactPhone?.trim(),
          contactEmail: dto.contactEmail?.trim(),
        },
      });

      await this.auditService.log({
        action: 'INSURANCE_PROVIDER_CREATED',
        entity: 'InsuranceProvider',
        entityId: provider.id,
        hospitalId: user.hospitalId,
        userId: user.sub,
        metadata: { name: provider.name, providerType: provider.providerType },
      });

      return provider;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Provider code already exists');
      }
      throw error;
    }
  }

  async listProviders(user: AuthenticatedUser) {
    return this.prisma.insuranceProvider.findMany({
      where: { hospitalId: user.hospitalId },
      orderBy: { name: 'asc' },
    });
  }

  async getProvider(user: AuthenticatedUser, id: string) {
    return this.findOwnedProvider(user, id);
  }

  async updateProvider(user: AuthenticatedUser, id: string, dto: UpdateProviderDto) {
    await this.findOwnedProvider(user, id);
    const provider = await this.prisma.insuranceProvider.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        code: dto.code !== undefined ? dto.code?.trim() || null : undefined,
        providerType: dto.providerType,
        contactName: dto.contactName?.trim(),
        contactPhone: dto.contactPhone?.trim(),
        contactEmail: dto.contactEmail?.trim(),
        isActive: dto.isActive,
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_PROVIDER_UPDATED',
      entity: 'InsuranceProvider',
      entityId: provider.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
      metadata: { isActive: provider.isActive },
    });

    return provider;
  }

  // --- Empanelments ---

  async createEmpanelment(user: AuthenticatedUser, dto: CreateEmpanelmentDto) {
    await this.findOwnedProvider(user, dto.providerId);

    const existingActive = await this.prisma.insuranceEmpanelment.findFirst({
      where: {
        hospitalId: user.hospitalId,
        providerId: dto.providerId,
        status: InsuranceEmpanelmentStatus.ACTIVE,
      },
    });

    if (existingActive) {
      throw new ConflictException('An active empanelment already exists for this provider');
    }

    const empanelment = await this.prisma.insuranceEmpanelment.create({
      data: {
        hospitalId: user.hospitalId,
        providerId: dto.providerId,
        referenceNumber: dto.referenceNumber?.trim(),
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        notes: dto.notes?.trim(),
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_EMPANELMENT_CREATED',
      entity: 'InsuranceEmpanelment',
      entityId: empanelment.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
      metadata: { providerId: dto.providerId, status: empanelment.status },
    });

    return empanelment;
  }

  async listEmpanelments(user: AuthenticatedUser, query: EmpanelmentQueryDto) {
    const where: Prisma.InsuranceEmpanelmentWhereInput = {
      hospitalId: user.hospitalId,
    };
    if (query.providerId) {
      await this.findOwnedProvider(user, query.providerId);
      where.providerId = query.providerId;
    }
    if (query.status) where.status = query.status;

    return this.prisma.insuranceEmpanelment.findMany({
      where,
      include: { provider: { select: { id: true, name: true, providerType: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async updateEmpanelment(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateEmpanelmentDto,
  ) {
    const existing = await this.prisma.insuranceEmpanelment.findUnique({ where: { id } });
    if (!existing || existing.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Empanelment not found');
    }

    if (dto.status === InsuranceEmpanelmentStatus.ACTIVE) {
      const duplicate = await this.prisma.insuranceEmpanelment.findFirst({
        where: {
          hospitalId: user.hospitalId,
          providerId: existing.providerId,
          status: InsuranceEmpanelmentStatus.ACTIVE,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ConflictException('Another active empanelment exists for this provider');
      }
    }

    return this.prisma.insuranceEmpanelment.update({
      where: { id },
      data: {
        status: dto.status,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
        notes: dto.notes?.trim(),
      },
    });
  }

  // --- Policies ---

  async createPolicy(user: AuthenticatedUser, dto: CreatePolicyDto) {
    await this.validatePatient(user, dto.patientId);
    await this.findOwnedProvider(user, dto.providerId);

    if (dto.coverageStartDate && dto.coverageEndDate) {
      if (new Date(dto.coverageEndDate) < new Date(dto.coverageStartDate)) {
        throw new BadRequestException('Coverage end date must be after start date');
      }
    }

    try {
      const policy = await this.prisma.patientInsurancePolicy.create({
        data: {
          hospitalId: user.hospitalId,
          patientId: dto.patientId,
          providerId: dto.providerId,
          policyNumber: dto.policyNumber.trim(),
          memberId: dto.memberId?.trim(),
          groupNumber: dto.groupNumber?.trim(),
          planName: dto.planName?.trim(),
          coverageStartDate: dto.coverageStartDate
            ? new Date(dto.coverageStartDate)
            : null,
          coverageEndDate: dto.coverageEndDate ? new Date(dto.coverageEndDate) : null,
          sumInsured: dto.sumInsured != null ? parseMoney(dto.sumInsured) : null,
          copayType: dto.copayType,
          copayValue:
            dto.copayValue != null ? parseMoney(dto.copayValue) : null,
          empanelmentId: dto.empanelmentId,
        },
        include: { provider: true },
      });

      await this.auditService.log({
        action: 'INSURANCE_POLICY_CREATED',
        entity: 'PatientInsurancePolicy',
        entityId: policy.id,
        hospitalId: user.hospitalId,
        userId: user.sub,
        metadata: { patientId: policy.patientId, providerId: policy.providerId },
      });

      return policy;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Policy number already exists');
      }
      throw error;
    }
  }

  async listPolicies(user: AuthenticatedUser, query: PolicyQueryDto) {
    const where: Prisma.PatientInsurancePolicyWhereInput = {
      hospitalId: user.hospitalId,
    };
    if (query.patientId) {
      await this.validatePatient(user, query.patientId);
      where.patientId = query.patientId;
    }
    if (query.providerId) {
      await this.findOwnedProvider(user, query.providerId);
      where.providerId = query.providerId;
    }
    if (query.status) where.status = query.status;

    if (user.branchId != null) {
      where.patient = { branchId: user.branchId };
    }

    return this.prisma.patientInsurancePolicy.findMany({
      where,
      include: { provider: { select: { id: true, name: true, providerType: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPolicy(user: AuthenticatedUser, id: string) {
    return this.findOwnedPolicy(user, id);
  }

  async updatePolicy(user: AuthenticatedUser, id: string, dto: UpdatePolicyDto) {
    await this.findOwnedPolicy(user, id);
    return this.prisma.patientInsurancePolicy.update({
      where: { id },
      data: {
        status: dto.status,
        memberId: dto.memberId?.trim(),
        groupNumber: dto.groupNumber?.trim(),
        planName: dto.planName?.trim(),
        coverageEndDate: dto.coverageEndDate ? new Date(dto.coverageEndDate) : undefined,
        sumInsured: dto.sumInsured != null ? parseMoney(dto.sumInsured) : undefined,
      },
    }).then(async (policy) => {
      await this.auditService.log({
        action: 'INSURANCE_POLICY_UPDATED',
        entity: 'PatientInsurancePolicy',
        entityId: policy.id,
        hospitalId: user.hospitalId,
        userId: user.sub,
        metadata: { status: policy.status },
      });
      return policy;
    });
  }

  // --- Pre-authorizations ---

  async createPreAuthorization(user: AuthenticatedUser, dto: CreatePreAuthorizationDto) {
    await this.validatePatient(user, dto.patientId);
    const policy = await this.findOwnedPolicy(user, dto.policyId);

    if (policy.patientId !== dto.patientId) {
      throw new BadRequestException('Policy does not belong to the specified patient');
    }

    if (policy.status !== PatientInsurancePolicyStatus.ACTIVE) {
      throw new BadRequestException('Policy is not active');
    }

    const branchId = resolveCreateBranchId(user, dto.branchId);

    if (branchId) {
      await this.validateBranch(user, branchId);
    }

    if (dto.admissionId) {
      const admission = await this.prisma.ipdAdmission.findUnique({
        where: { id: dto.admissionId },
      });
      if (!admission || admission.hospitalId !== user.hospitalId) {
        throw new NotFoundException('Admission not found');
      }
      if (admission.patientId !== dto.patientId) {
        throw new BadRequestException('Admission does not belong to the specified patient');
      }
    }

    if (dto.encounterId) {
      const encounter = await this.prisma.clinicalEncounter.findUnique({
        where: { id: dto.encounterId },
      });
      if (!encounter || encounter.hospitalId !== user.hospitalId) {
        throw new NotFoundException('Clinical encounter not found');
      }
      if (encounter.patientId !== dto.patientId) {
        throw new BadRequestException('Encounter does not belong to the specified patient');
      }
    }

    const preAuth = await this.prisma.insurancePreAuthorization.create({
      data: {
        hospitalId: user.hospitalId,
        branchId: branchId ?? null,
        patientId: dto.patientId,
        policyId: dto.policyId,
        providerId: policy.providerId,
        admissionId: dto.admissionId,
        encounterId: dto.encounterId,
        requestedAmount: parseMoney(dto.requestedAmount),
        notes: dto.notes?.trim(),
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_PREAUTH_CREATED',
      entity: 'InsurancePreAuthorization',
      entityId: preAuth.id,
      hospitalId: user.hospitalId,
      branchId: preAuth.branchId,
      userId: user.sub,
      metadata: { patientId: preAuth.patientId, status: preAuth.status },
    });

    return preAuth;
  }

  async listPreAuthorizations(user: AuthenticatedUser, query: PreAuthorizationQueryDto) {
    const where: Prisma.InsurancePreAuthorizationWhereInput = {
      hospitalId: user.hospitalId,
    };
    if (query.patientId) {
      await this.validatePatient(user, query.patientId);
      where.patientId = query.patientId;
    }
    if (query.policyId) where.policyId = query.policyId;
    if (query.status) where.status = query.status as InsurancePreAuthorizationStatus;

    return this.prisma.insurancePreAuthorization.findMany({
      where: applyBranchScope(user, where),
      orderBy: { requestDate: 'desc' },
    });
  }

  async getPreAuthorization(user: AuthenticatedUser, id: string) {
    return this.findOwnedPreAuth(user, id);
  }

  private assertPreauthTransition(
    current: InsurancePreAuthorizationStatus,
    next: InsurancePreAuthorizationStatus,
  ) {
    if (!isAllowedPreauthTransition(current, next)) {
      throw new BadRequestException(
        `Cannot transition pre-authorization from ${current} to ${next}`,
      );
    }
  }

  async submitPreAuthorization(user: AuthenticatedUser, id: string) {
    const preAuth = await this.findOwnedPreAuth(user, id);
    this.assertPreauthTransition(preAuth.status, InsurancePreAuthorizationStatus.SUBMITTED);

    const updated = await this.prisma.insurancePreAuthorization.update({
      where: { id },
      data: { status: InsurancePreAuthorizationStatus.SUBMITTED },
    });

    await this.auditService.log({
      action: 'INSURANCE_PREAUTH_SUBMITTED',
      entity: 'InsurancePreAuthorization',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { previousStatus: preAuth.status, newStatus: updated.status },
    });

    return updated;
  }

  async reviewPreAuthorization(user: AuthenticatedUser, id: string) {
    const preAuth = await this.findOwnedPreAuth(user, id);
    this.assertPreauthTransition(preAuth.status, InsurancePreAuthorizationStatus.UNDER_REVIEW);

    const updated = await this.prisma.insurancePreAuthorization.update({
      where: { id },
      data: { status: InsurancePreAuthorizationStatus.UNDER_REVIEW },
    });

    await this.auditService.log({
      action: 'INSURANCE_PREAUTH_REVIEWED',
      entity: 'InsurancePreAuthorization',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { previousStatus: preAuth.status, newStatus: updated.status },
    });

    return updated;
  }

  async approvePreAuthorization(
    user: AuthenticatedUser,
    id: string,
    dto: ApprovePreAuthorizationDto,
  ) {
    const preAuth = await this.findOwnedPreAuth(user, id);
    const approvedAmount = parseMoney(dto.approvedAmount);
    const claimed = roundMoney(preAuth.requestedAmount);

    if (approvedAmount.greaterThan(claimed)) {
      throw new BadRequestException('Approved amount cannot exceed requested amount');
    }

    const nextStatus =
      approvedAmount.lessThan(claimed)
        ? InsurancePreAuthorizationStatus.PARTIALLY_APPROVED
        : InsurancePreAuthorizationStatus.APPROVED;

    this.assertPreauthTransition(preAuth.status, nextStatus);

    const updated = await this.prisma.insurancePreAuthorization.update({
      where: { id },
      data: {
        status: nextStatus,
        approvedAmount,
        decisionDate: new Date(),
        authorizationNumber: dto.authorizationNumber?.trim(),
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_PREAUTH_APPROVED',
      entity: 'InsurancePreAuthorization',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        status: updated.status,
        approvedAmount: approvedAmount.toString(),
      },
    });

    return updated;
  }

  async rejectPreAuthorization(
    user: AuthenticatedUser,
    id: string,
    dto: RejectPreAuthorizationDto,
  ) {
    const preAuth = await this.findOwnedPreAuth(user, id);
    this.assertPreauthTransition(preAuth.status, InsurancePreAuthorizationStatus.REJECTED);

    const updated = await this.prisma.insurancePreAuthorization.update({
      where: { id },
      data: {
        status: InsurancePreAuthorizationStatus.REJECTED,
        rejectionReason: dto.rejectionReason.trim(),
        decisionDate: new Date(),
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_PREAUTH_REJECTED',
      entity: 'InsurancePreAuthorization',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { status: updated.status },
    });

    return updated;
  }

  async cancelPreAuthorization(user: AuthenticatedUser, id: string) {
    const preAuth = await this.findOwnedPreAuth(user, id);

    if (!isPreauthCancellable(preAuth.status)) {
      throw new BadRequestException(`Pre-authorization cannot be cancelled when ${preAuth.status}`);
    }

    this.assertPreauthTransition(preAuth.status, InsurancePreAuthorizationStatus.CANCELLED);

    const updated = await this.prisma.insurancePreAuthorization.update({
      where: { id },
      data: { status: InsurancePreAuthorizationStatus.CANCELLED },
    });

    await this.auditService.log({
      action: 'INSURANCE_PREAUTH_CANCELLED',
      entity: 'InsurancePreAuthorization',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { previousStatus: preAuth.status },
    });

    return updated;
  }

  // --- Claims ---

  async createClaim(user: AuthenticatedUser, dto: CreateClaimDto) {
    await this.validatePatient(user, dto.patientId);
    const policy = await this.findOwnedPolicy(user, dto.policyId);

    if (policy.patientId !== dto.patientId) {
      throw new BadRequestException('Policy does not belong to the specified patient');
    }

    if (policy.status !== PatientInsurancePolicyStatus.ACTIVE) {
      throw new BadRequestException('Policy is not active');
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice || invoice.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.patientId !== dto.patientId) {
      throw new BadRequestException('Invoice does not belong to the specified patient');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot create claim for a cancelled invoice');
    }

    assertBranchAccess(user, invoice.branchId);

    const branchId = resolveCreateBranchId(user, dto.branchId ?? invoice.branchId);

    if (branchId) {
      await this.validateBranch(user, branchId);
    }

    if (dto.preAuthorizationId) {
      const preAuth = await this.findOwnedPreAuth(user, dto.preAuthorizationId);
      if (preAuth.patientId !== dto.patientId || preAuth.policyId !== dto.policyId) {
        throw new BadRequestException('Pre-authorization does not match patient/policy');
      }
    }

    const claimedAmount = roundMoney(invoice.totalAmount);
    let claim;

    for (let attempt = 0; attempt < MAX_CLAIM_NUMBER_RETRIES; attempt += 1) {
      try {
        claim = await this.prisma.$transaction(async (tx) => {
          const claimNumber = await this.generateClaimNumber(tx, user.hospitalId);

          return tx.insuranceClaim.create({
            data: {
              hospitalId: user.hospitalId,
              branchId,
              patientId: dto.patientId,
              policyId: dto.policyId,
              providerId: policy.providerId,
              invoiceId: dto.invoiceId,
              preAuthorizationId: dto.preAuthorizationId,
              claimNumber,
              claimedAmount,
              status: InsuranceClaimStatus.READY,
              notes: dto.notes?.trim(),
            },
          });
        });
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < MAX_CLAIM_NUMBER_RETRIES - 1
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!claim) throw new ConflictException('Failed to create claim');

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_CREATED',
      entity: 'InsuranceClaim',
      entityId: claim.id,
      hospitalId: user.hospitalId,
      branchId: claim.branchId,
      userId: user.sub,
      metadata: {
        claimNumber: claim.claimNumber,
        invoiceId: claim.invoiceId,
        claimedAmount: claimedAmount.toString(),
      },
    });

    return this.formatClaim(await this.findOwnedClaim(user, claim.id));
  }

  async listClaims(user: AuthenticatedUser, query: ClaimQueryDto) {
    const where: Prisma.InsuranceClaimWhereInput = { hospitalId: user.hospitalId };

    if (query.patientId) {
      await this.validatePatient(user, query.patientId);
      where.patientId = query.patientId;
    }
    if (query.providerId) {
      await this.findOwnedProvider(user, query.providerId);
      where.providerId = query.providerId;
    }
    if (query.policyId) where.policyId = query.policyId;
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.status) where.status = query.status;

    const claims = await this.prisma.insuranceClaim.findMany({
      where: applyBranchScope(user, where),
      include: {
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true } },
        policy: { select: { id: true, policyNumber: true, providerId: true } },
        provider: { select: { id: true, name: true, providerType: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let formatted = claims.map((c) => this.formatClaim(c as any));

    if (query.minAgeDays != null) {
      formatted = formatted.filter((c) => c.ageInDays >= query.minAgeDays!);
    }

    return formatted;
  }

  async getClaim(user: AuthenticatedUser, id: string) {
    return this.formatClaim(await this.findOwnedClaim(user, id));
  }

  private assertClaimTransition(current: InsuranceClaimStatus, next: InsuranceClaimStatus) {
    if (!isAllowedClaimTransition(current, next)) {
      throw new BadRequestException(
        `Cannot transition claim from ${current} to ${next}`,
      );
    }
  }

  async submitClaim(user: AuthenticatedUser, id: string) {
    const claim = await this.findOwnedClaim(user, id);
    this.assertClaimTransition(claim.status, InsuranceClaimStatus.SUBMITTED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.insuranceClaim.update({
        where: { id },
        data: {
          status: InsuranceClaimStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });

      const event = buildInsuranceClaimSubmittedDomainEvent({
        claimId: row.id,
        claimNumber: row.claimNumber,
        hospitalId: row.hospitalId,
        branchId: row.branchId,
        patientId: row.patientId,
      });
      const outbox = await this.domainEventOutboxService.createInTransaction(
        tx,
        event,
      );
      await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: row.hospitalId,
        branchId: row.branchId,
        outboxId: outbox.id,
      });

      return row;
    });

    await this.onClaimSubmitted(updated.id);

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_SUBMITTED',
      entity: 'InsuranceClaim',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: { claimNumber: updated.claimNumber, previousStatus: claim.status },
    });

    return this.formatClaim(await this.findOwnedClaim(user, id));
  }

  async reviewClaim(user: AuthenticatedUser, id: string) {
    const claim = await this.findOwnedClaim(user, id);
    this.assertClaimTransition(claim.status, InsuranceClaimStatus.UNDER_REVIEW);

    await this.prisma.insuranceClaim.update({
      where: { id },
      data: { status: InsuranceClaimStatus.UNDER_REVIEW },
    });

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_REVIEWED',
      entity: 'InsuranceClaim',
      entityId: id,
      hospitalId: user.hospitalId,
      branchId: claim.branchId,
      userId: user.sub,
      metadata: { previousStatus: claim.status },
    });

    return this.formatClaim(await this.findOwnedClaim(user, id));
  }

  async approveClaim(user: AuthenticatedUser, id: string, dto: ApproveClaimDto) {
    const claim = await this.findOwnedClaim(user, id);
    const policy = await this.prisma.patientInsurancePolicy.findUnique({
      where: { id: claim.policyId },
    });

    if (!policy) {
      throw new NotFoundException('Policy not found');
    }

    const split = calculateCopaySplit({
      approvedAmount: parseMoney(dto.approvedAmount),
      policy: {
        copayType: policy.copayType,
        copayValue: policy.copayValue,
      },
      overridePatientResponsibility:
        dto.patientResponsibility != null
          ? parseMoney(dto.patientResponsibility)
          : undefined,
    });

    const nextStatus = split.approvedAmount.lessThan(claim.claimedAmount)
      ? InsuranceClaimStatus.PARTIALLY_APPROVED
      : InsuranceClaimStatus.APPROVED;

    this.assertClaimTransition(claim.status, nextStatus);

    await this.prisma.$transaction(async (tx) => {
      await tx.insuranceClaim.update({
        where: { id },
        data: {
          status: nextStatus,
          approvedAmount: split.approvedAmount,
          patientResponsibility: split.patientResponsibility,
          payerResponsibility: split.payerResponsibility,
          approvedAt: new Date(),
        },
      });

      await tx.invoice.update({
        where: { id: claim.invoiceId },
        data: {
          insurancePatientResponsibilityAmount: split.patientResponsibility,
          insurancePayerResponsibilityAmount: split.payerResponsibility,
        },
      });
    });

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_APPROVED',
      entity: 'InsuranceClaim',
      entityId: id,
      hospitalId: user.hospitalId,
      branchId: claim.branchId,
      userId: user.sub,
      metadata: {
        status: nextStatus,
        approvedAmount: split.approvedAmount.toString(),
        patientResponsibility: split.patientResponsibility.toString(),
        payerResponsibility: split.payerResponsibility.toString(),
      },
    });

    return this.formatClaim(await this.findOwnedClaim(user, id));
  }

  async rejectClaim(user: AuthenticatedUser, id: string, dto: RejectClaimDto) {
    const claim = await this.findOwnedClaim(user, id);
    this.assertClaimTransition(claim.status, InsuranceClaimStatus.REJECTED);

    await this.prisma.insuranceClaim.update({
      where: { id },
      data: {
        status: InsuranceClaimStatus.REJECTED,
        rejectionReason: dto.rejectionReason.trim(),
        rejectedAt: new Date(),
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_REJECTED',
      entity: 'InsuranceClaim',
      entityId: id,
      hospitalId: user.hospitalId,
      branchId: claim.branchId,
      userId: user.sub,
      metadata: { previousStatus: claim.status },
    });

    return this.formatClaim(await this.findOwnedClaim(user, id));
  }

  async recordClaimPayment(user: AuthenticatedUser, id: string, dto: RecordClaimPaymentDto) {
    const claim = await this.findOwnedClaim(user, id);

    if (
      claim.status !== InsuranceClaimStatus.APPROVED &&
      claim.status !== InsuranceClaimStatus.PARTIALLY_APPROVED
    ) {
      throw new BadRequestException('Payment can only be recorded for approved claims');
    }

    if (!claim.approvedAmount) {
      throw new BadRequestException('Claim has no approved amount');
    }

    const settlementAmount = parseMoney(dto.paidAmount);
    if (settlementAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Settlement amount must be positive');
    }

    const idempotencyKey = dto.idempotencyKey?.trim()
      ? `insurance.claim.settlement:${id}:${dto.idempotencyKey.trim()}`
      : undefined;

    if (idempotencyKey) {
      const existingPayment = await this.prisma.payment.findFirst({
        where: { hospitalId: user.hospitalId, idempotencyKey },
      });
      if (existingPayment) {
        return this.formatClaim(await this.findOwnedClaim(user, id));
      }
    }

    const invoiceSnapshot = await this.prisma.invoice.findFirst({
      where: { id: claim.invoiceId, hospitalId: user.hospitalId },
    });
    if (!invoiceSnapshot) {
      throw new NotFoundException('Invoice not found for claim');
    }

    if (
      invoiceSnapshot.insurancePayerResponsibilityAmount == null ||
      invoiceSnapshot.insurancePayerResponsibilityAmount.lessThanOrEqualTo(0)
    ) {
      throw new BadRequestException('Invoice has no insurer responsibility');
    }

    await this.prisma.$transaction(async (tx) => {
      const invoice = await this.invoiceSplitPayerService.lockInvoiceForUpdate(
        tx,
        claim.invoiceId,
        user.hospitalId,
      );

      const balances = await this.invoiceSplitPayerService.computeBalancesForInvoice(
        invoice,
        tx,
      );

      if (settlementAmount.greaterThan(balances.insurerOutstanding)) {
        throw new BadRequestException(
          'Settlement exceeds remaining insurer responsibility on invoice',
        );
      }

      const lockedClaim = await tx.insuranceClaim.findFirstOrThrow({
        where: { id, hospitalId: user.hospitalId },
      });

      const newClaimPaidTotal = roundMoney(lockedClaim.paidAmount.plus(settlementAmount));
      if (newClaimPaidTotal.greaterThan(lockedClaim.payerResponsibility)) {
        throw new BadRequestException('Payment exceeds insurer responsibility on claim');
      }

      const nextStatus = newClaimPaidTotal.equals(lockedClaim.payerResponsibility)
        ? InsuranceClaimStatus.PAID
        : lockedClaim.status;

      if (nextStatus === InsuranceClaimStatus.PAID) {
        this.assertClaimTransition(lockedClaim.status, InsuranceClaimStatus.PAID);
      }

      try {
        await tx.payment.create({
          data: {
            hospitalId: user.hospitalId,
            branchId: invoice.branchId,
            invoiceId: invoice.id,
            insuranceClaimId: lockedClaim.id,
            amount: settlementAmount,
            currency: invoice.currency,
            provider: PaymentProvider.MANUAL,
            payerType: PaymentPayerType.INSURER,
            status: PaymentStatus.SUCCEEDED,
            paidAt: new Date(),
            idempotencyKey: idempotencyKey ?? null,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          idempotencyKey
        ) {
          return;
        }
        throw error;
      }

      await tx.insuranceClaim.update({
        where: { id: lockedClaim.id },
        data: {
          paidAmount: newClaimPaidTotal,
          status: nextStatus,
          paidAt: nextStatus === InsuranceClaimStatus.PAID ? new Date() : lockedClaim.paidAt,
        },
      });

      await this.invoiceSplitPayerService.syncInvoiceSettlementStatus(tx, invoice, {
        source: 'insurance_claim_settlement',
        claimId: lockedClaim.id,
        settlementAmount: settlementAmount.toFixed(2),
      });
    });

    await this.auditService.log({
      action: 'INSURER_PAYMENT_RECORDED',
      entity: 'InsuranceClaim',
      entityId: id,
      hospitalId: user.hospitalId,
      branchId: claim.branchId,
      userId: user.sub,
      metadata: {
        paidAmount: settlementAmount.toFixed(2),
        invoiceId: claim.invoiceId,
      },
    });

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_PAYMENT_RECORDED',
      entity: 'InsuranceClaim',
      entityId: id,
      hospitalId: user.hospitalId,
      branchId: claim.branchId,
      userId: user.sub,
      metadata: {
        paidAmount: settlementAmount.toString(),
        invoiceId: claim.invoiceId,
      },
    });

    return this.formatClaim(await this.findOwnedClaim(user, id));
  }

  async cancelClaim(user: AuthenticatedUser, id: string) {
    const claim = await this.findOwnedClaim(user, id);

    if (!isClaimCancellable(claim.status)) {
      throw new BadRequestException(`Claim cannot be cancelled when ${claim.status}`);
    }

    this.assertClaimTransition(claim.status, InsuranceClaimStatus.CANCELLED);

    await this.prisma.insuranceClaim.update({
      where: { id },
      data: { status: InsuranceClaimStatus.CANCELLED },
    });

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_CANCELLED',
      entity: 'InsuranceClaim',
      entityId: id,
      hospitalId: user.hospitalId,
      branchId: claim.branchId,
      userId: user.sub,
      metadata: { previousStatus: claim.status, claimNumber: claim.claimNumber },
    });

    return this.formatClaim(await this.findOwnedClaim(user, id));
  }
}
