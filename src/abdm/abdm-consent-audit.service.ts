import { Injectable } from '@nestjs/common';
import { AbdmConsentAuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export type CreateConsentAuditInput = {
  hospitalId: string;
  consentId: string;
  action: AbdmConsentAuditAction;
  actorUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AbdmConsentAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: CreateConsentAuditInput) {
    return this.prisma.abdmConsentAuditLog.create({
      data: {
        hospitalId: input.hospitalId,
        consentId: input.consentId,
        action: input.action,
        actorUserId: input.actorUserId ?? undefined,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async findByConsentId(hospitalId: string, consentId: string) {
    return this.prisma.abdmConsentAuditLog.findMany({
      where: {
        hospitalId,
        consentId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }
}
