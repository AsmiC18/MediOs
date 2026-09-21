import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AbdmConsentAuditAction,
  AbdmConsentStatus,
  AbdmConsent,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AbdmConsentAuditService } from './abdm-consent-audit.service';
import { AbdmConsentManagerService } from './abdm-consent-manager.service';
import { ConsentQueryDto } from './dto/consent-query.dto';
import { CreateConsentDto } from './dto/create-consent.dto';
import { UpdateConsentStatusDto } from './dto/update-consent-status.dto';
import { isAllowedConsentTransition } from './utils/consent-transitions.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

@Injectable()
export class AbdmConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly consentAuditService: AbdmConsentAuditService,
    private readonly consentManagerService: AbdmConsentManagerService,
  ) {}

  private async findOwnedPatient(user: AuthenticatedUser, patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  private async findOwnedConsent(user: AuthenticatedUser, consentId: string) {
    const consent = await this.prisma.abdmConsent.findUnique({
      where: { id: consentId },
    });

    if (!consent || consent.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Consent not found');
    }

    return consent;
  }

  private async validateBranch(
    user: AuthenticatedUser,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Branch not found');
    }
  }

  private assertValidTransition(
    currentStatus: AbdmConsentStatus,
    nextStatus: AbdmConsentStatus,
  ): void {
    if (currentStatus === nextStatus) {
      throw new ConflictException('Consent is already in the requested status');
    }

    if (!isAllowedConsentTransition(currentStatus, nextStatus)) {
      throw new BadRequestException(
        `Invalid consent status transition from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private resolveAuditAction(
    nextStatus: AbdmConsentStatus,
  ): AbdmConsentAuditAction {
    switch (nextStatus) {
      case AbdmConsentStatus.GRANTED:
        return AbdmConsentAuditAction.GRANTED;
      case AbdmConsentStatus.DENIED:
        return AbdmConsentAuditAction.DENIED;
      case AbdmConsentStatus.EXPIRED:
        return AbdmConsentAuditAction.EXPIRED;
      case AbdmConsentStatus.REVOKED:
        return AbdmConsentAuditAction.REVOKED;
      default:
        return AbdmConsentAuditAction.STATUS_CHANGED;
    }
  }

  private resolveMainAuditAction(nextStatus: AbdmConsentStatus): string {
    switch (nextStatus) {
      case AbdmConsentStatus.GRANTED:
        return 'ABDM_CONSENT_GRANTED';
      case AbdmConsentStatus.DENIED:
        return 'ABDM_CONSENT_DENIED';
      case AbdmConsentStatus.EXPIRED:
        return 'ABDM_CONSENT_EXPIRED';
      case AbdmConsentStatus.REVOKED:
        return 'ABDM_CONSENT_REVOKED';
      default:
        return 'ABDM_CONSENT_STATUS_CHANGED';
    }
  }

  private buildStatusTimestamps(
    nextStatus: AbdmConsentStatus,
    now: Date,
  ): Prisma.AbdmConsentUpdateInput {
    switch (nextStatus) {
      case AbdmConsentStatus.GRANTED:
        return { grantedAt: now };
      case AbdmConsentStatus.DENIED:
        return { deniedAt: now };
      case AbdmConsentStatus.REVOKED:
        return { revokedAt: now };
      default:
        return {};
    }
  }

  private isConsentExpired(consent: AbdmConsent, now = new Date()): boolean {
    return (
      consent.status === AbdmConsentStatus.GRANTED &&
      consent.expiresAt !== null &&
      consent.expiresAt <= now
    );
  }

  async expireConsentIfNeeded(
    user: AuthenticatedUser,
    consent: AbdmConsent,
  ): Promise<AbdmConsent> {
    if (!this.isConsentExpired(consent)) {
      return consent;
    }

    return this.applyStatusTransition(user, consent, AbdmConsentStatus.EXPIRED);
  }

  async expireExpiredConsents(input: {
    hospitalId: string;
    patientId?: string;
  }): Promise<number> {
    const now = new Date();
    const expiredConsents = await this.prisma.abdmConsent.findMany({
      where: {
        hospitalId: input.hospitalId,
        ...(input.patientId ? { patientId: input.patientId } : {}),
        status: AbdmConsentStatus.GRANTED,
        expiresAt: {
          lte: now,
        },
      },
    });

    for (const consent of expiredConsents) {
      await this.applyStatusTransition(
        {
          sub: consent.requestedByUserId,
          hospitalId: consent.hospitalId,
          branchId: consent.branchId,
        },
        consent,
        AbdmConsentStatus.EXPIRED,
      );
    }

    return expiredConsents.length;
  }

  private async applyStatusTransition(
    user: AuthenticatedUser,
    consent: AbdmConsent,
    nextStatus: AbdmConsentStatus,
    reason?: string,
  ): Promise<AbdmConsent> {
    this.assertValidTransition(consent.status, nextStatus);

    const now = new Date();
    let consentRequestId = consent.consentRequestId;

    if (
      consent.status === AbdmConsentStatus.DRAFT &&
      nextStatus === AbdmConsentStatus.REQUESTED
    ) {
      const managerResult = await this.consentManagerService.createConsentRequest(
        {
          patientId: consent.patientId,
          purpose: consent.purpose,
        },
      );
      consentRequestId = managerResult.consentRequestId;
    }

    const updatedConsent = await this.prisma.abdmConsent.update({
      where: { id: consent.id },
      data: {
        status: nextStatus,
        ...(consentRequestId !== consent.consentRequestId && {
          consentRequestId,
        }),
        ...this.buildStatusTimestamps(nextStatus, now),
        ...(nextStatus === AbdmConsentStatus.REVOKED &&
          reason !== undefined && { revokeReason: reason }),
      },
    });

    const safeMetadata: Prisma.InputJsonValue = {
      previousStatus: consent.status,
      newStatus: nextStatus,
      consentId: consent.id,
      patientId: consent.patientId,
      ...(reason ? { reason } : {}),
    };

    await this.consentAuditService.log({
      hospitalId: consent.hospitalId,
      consentId: consent.id,
      action: this.resolveAuditAction(nextStatus),
      actorUserId: user.sub,
      metadata: safeMetadata,
    });

    await this.auditService.log({
      action: this.resolveMainAuditAction(nextStatus),
      entity: 'AbdmConsent',
      entityId: consent.id,
      hospitalId: consent.hospitalId,
      branchId: consent.branchId,
      userId: user.sub,
      metadata: safeMetadata,
    });

    return updatedConsent;
  }

  async createConsent(
    user: AuthenticatedUser,
    patientId: string,
    dto: CreateConsentDto,
  ) {
    const patient = await this.findOwnedPatient(user, patientId);

    if (dto.branchId) {
      await this.validateBranch(user, dto.branchId);
    }

    const initialStatus = dto.status ?? AbdmConsentStatus.REQUESTED;

    if (
      initialStatus !== AbdmConsentStatus.DRAFT &&
      initialStatus !== AbdmConsentStatus.REQUESTED
    ) {
      throw new BadRequestException(
        'Consent can only be created with DRAFT or REQUESTED status',
      );
    }

    let consentRequestId: string | undefined;

    if (initialStatus === AbdmConsentStatus.REQUESTED) {
      const managerResult = await this.consentManagerService.createConsentRequest(
        {
          patientId,
          purpose: dto.purpose,
        },
      );
      consentRequestId = managerResult.consentRequestId;
    }

    const consent = await this.prisma.abdmConsent.create({
      data: {
        hospitalId: user.hospitalId,
        branchId: dto.branchId ?? patient.branchId,
        patientId,
        consentRequestId,
        purpose: dto.purpose,
        hiTypes: dto.hiTypes,
        status: initialStatus,
        requestedByUserId: user.sub,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    await this.consentAuditService.log({
      hospitalId: user.hospitalId,
      consentId: consent.id,
      action: AbdmConsentAuditAction.CREATED,
      actorUserId: user.sub,
      metadata: {
        status: consent.status,
        consentId: consent.id,
        patientId,
        ...(consent.consentRequestId
          ? { consentRequestId: consent.consentRequestId }
          : {}),
      },
    });

    await this.auditService.log({
      action: 'ABDM_CONSENT_CREATED',
      entity: 'AbdmConsent',
      entityId: consent.id,
      hospitalId: user.hospitalId,
      branchId: consent.branchId,
      userId: user.sub,
      metadata: {
        patientId,
        status: consent.status,
        consentId: consent.id,
      },
    });

    return consent;
  }

  async listConsents(
    user: AuthenticatedUser,
    patientId: string,
    query: ConsentQueryDto = {},
  ) {
    await this.findOwnedPatient(user, patientId);
    await this.expireExpiredConsents({
      hospitalId: user.hospitalId,
      patientId,
    });

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where: Prisma.AbdmConsentWhereInput = {
      hospitalId: user.hospitalId,
      patientId,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.abdmConsent.count({ where }),
      this.prisma.abdmConsent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getConsent(user: AuthenticatedUser, consentId: string) {
    const consent = await this.findOwnedConsent(user, consentId);
    return this.expireConsentIfNeeded(user, consent);
  }

  async findActiveConsent(
    user: AuthenticatedUser,
    patientId: string,
    purpose: string,
  ) {
    await this.findOwnedPatient(user, patientId);
    await this.expireExpiredConsents({
      hospitalId: user.hospitalId,
      patientId,
    });

    const now = new Date();

    return this.prisma.abdmConsent.findFirst({
      where: {
        hospitalId: user.hospitalId,
        patientId,
        purpose,
        status: AbdmConsentStatus.GRANTED,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async updateConsentStatus(
    user: AuthenticatedUser,
    consentId: string,
    dto: UpdateConsentStatusDto,
  ) {
    const consent = await this.findOwnedConsent(user, consentId);
    const current = await this.expireConsentIfNeeded(user, consent);

    if (current.status !== consent.status) {
      throw new BadRequestException(
        `Consent expired before transition to ${dto.status} could be applied`,
      );
    }

    return this.applyStatusTransition(
      user,
      current,
      dto.status,
      dto.reason,
    );
  }

  async getConsentAuditLog(user: AuthenticatedUser, consentId: string) {
    await this.findOwnedConsent(user, consentId);
    return this.consentAuditService.findByConsentId(user.hospitalId, consentId);
  }
}
