import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AbdmRegistrationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { LinkHprDto } from './dto/link-hpr.dto';
import { maskHprForAudit, validateHprId } from './utils/hpr-format.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class AbdmHprService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly environmentService: AbdmEnvironmentService,
  ) {}

  private async findOwnedUser(user: AuthenticatedUser, userId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser || targetUser.hospitalId !== user.hospitalId) {
      throw new NotFoundException('User not found');
    }

    assertBranchAccess(user, targetUser.branchId);

    return targetUser;
  }

  async getHprLink(user: AuthenticatedUser, userId: string) {
    await this.findOwnedUser(user, userId);

    const link = await this.prisma.abdmProfessionalLink.findUnique({
      where: {
        hospitalId_userId: {
          hospitalId: user.hospitalId,
          userId,
        },
      },
    });

    if (!link) {
      return {
        hospitalId: user.hospitalId,
        userId,
        hprId: null,
        linkStatus: AbdmRegistrationStatus.NOT_REGISTERED,
        linkedAt: null,
      };
    }

    return {
      hospitalId: link.hospitalId,
      userId: link.userId,
      hprId: link.hprId,
      linkStatus: link.linkStatus,
      linkedAt: link.linkedAt,
    };
  }

  async linkHpr(user: AuthenticatedUser, userId: string, dto: LinkHprDto) {
    await this.findOwnedUser(user, userId);

    let hprId: string;

    try {
      hprId = validateHprId(dto.hprId);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid HPR ID',
      );
    }

    const now = new Date();

    const link = await this.prisma.abdmProfessionalLink.upsert({
      where: {
        hospitalId_userId: {
          hospitalId: user.hospitalId,
          userId,
        },
      },
      create: {
        hospitalId: user.hospitalId,
        userId,
        hprId,
        linkStatus: AbdmRegistrationStatus.PENDING,
        linkedAt: now,
      },
      update: {
        hprId,
        linkStatus: AbdmRegistrationStatus.PENDING,
        linkedAt: now,
      },
    });

    await this.auditService.log({
      action: 'ABDM_HPR_LINKED',
      entity: 'AbdmProfessionalLink',
      entityId: link.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId,
      userId: user.sub,
      metadata: {
        targetUserId: userId,
        hprId: maskHprForAudit(hprId),
        linkStatus: link.linkStatus,
        registryConfirmed: false,
      },
    });

    return this.getHprLink(user, userId);
  }

  async syncHpr(user: AuthenticatedUser, userId: string) {
    await this.findOwnedUser(user, userId);

    const link = await this.prisma.abdmProfessionalLink.findUnique({
      where: {
        hospitalId_userId: {
          hospitalId: user.hospitalId,
          userId,
        },
      },
    });

    if (!link?.hprId) {
      throw new BadRequestException('User does not have a linked HPR ID to sync');
    }

    if (this.environmentService.isMockMode()) {
      const updated = await this.prisma.abdmProfessionalLink.update({
        where: { id: link.id },
        data: {
          linkStatus: AbdmRegistrationStatus.REGISTERED,
          linkedAt: link.linkedAt ?? new Date(),
        },
      });

      await this.auditService.log({
        action: 'ABDM_HPR_SYNCED',
        entity: 'AbdmProfessionalLink',
        entityId: updated.id,
        hospitalId: user.hospitalId,
        branchId: user.branchId,
        userId: user.sub,
        metadata: {
          targetUserId: userId,
          hprId: maskHprForAudit(updated.hprId),
          linkStatus: updated.linkStatus,
          mock: true,
          registryConfirmed: true,
        },
      });

      return this.getHprLink(user, userId);
    }

    throw new ServiceUnavailableException(
      'ABDM HPR sync is not available until the official search/profile endpoint is verified.',
    );
  }
}
