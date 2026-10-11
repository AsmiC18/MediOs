import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AbdmRegistrationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateAbdmProfessionalDto } from './dto/update-abdm-professional.dto';
import { maskHprForAudit, validateHprId } from './utils/hpr-format.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class AbdmProfessionalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async findOwnedUser(user: AuthenticatedUser, userId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!targetUser || targetUser.hospitalId !== user.hospitalId) {
      throw new NotFoundException('User not found');
    }

    assertBranchAccess(user, targetUser.branchId);

    return targetUser;
  }

  async getProfessionalLink(user: AuthenticatedUser, userId: string) {
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

    return link;
  }

  async updateProfessionalLink(
    user: AuthenticatedUser,
    userId: string,
    dto: UpdateAbdmProfessionalDto,
  ) {
    await this.findOwnedUser(user, userId);

    if (dto.linkStatus === AbdmRegistrationStatus.REGISTERED) {
      throw new BadRequestException(
        'HPR registration status cannot be set directly. Use POST /users/:id/abdm/hpr/sync after linking.',
      );
    }

    let hprId: string | undefined;

    if (dto.hprId !== undefined) {
      try {
        hprId = validateHprId(dto.hprId);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid HPR ID',
        );
      }
    }

    const now = new Date();
    const existingLink = await this.prisma.abdmProfessionalLink.findUnique({
      where: {
        hospitalId_userId: {
          hospitalId: user.hospitalId,
          userId,
        },
      },
    });

    const linkStatus =
      dto.linkStatus ??
      (hprId !== undefined
        ? AbdmRegistrationStatus.PENDING
        : existingLink?.linkStatus ?? AbdmRegistrationStatus.NOT_REGISTERED);
    const shouldSetLinkedAt = linkStatus === AbdmRegistrationStatus.PENDING;

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
        linkStatus,
        linkedAt: shouldSetLinkedAt ? now : undefined,
      },
      update: {
        ...(hprId !== undefined && {
          hprId,
          linkStatus:
            dto.linkStatus ??
            AbdmRegistrationStatus.PENDING,
          linkedAt: now,
        }),
        ...(hprId === undefined &&
          dto.linkStatus !== undefined && { linkStatus: dto.linkStatus }),
        ...(hprId === undefined &&
          dto.linkStatus === AbdmRegistrationStatus.PENDING && { linkedAt: now }),
      },
    });

    await this.auditService.log({
      action: 'ABDM_HPR_LINK_UPDATED',
      entity: 'AbdmProfessionalLink',
      entityId: link.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId,
      userId: user.sub,
      metadata: {
        targetUserId: userId,
        ...(link.hprId ? { hprId: maskHprForAudit(link.hprId) } : {}),
        linkStatus: link.linkStatus,
        registryConfirmed: false,
      },
    });

    return link;
  }
}
