import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface CreateAuditLogInput {
  hospitalId: string;
  branchId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        hospitalId: input.hospitalId,
        branchId: input.branchId ?? undefined,
        userId: input.userId ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? undefined,
        metadata: input.metadata ?? undefined,
      },
    });
  }
}
