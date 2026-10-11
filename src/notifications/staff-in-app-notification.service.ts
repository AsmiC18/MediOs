import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { applyBranchScope } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';

type StaffUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

export type CreateStaffInAppNotificationInput = {
  hospitalId: string;
  branchId?: string | null;
  userId: string;
  category: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
};

@Injectable()
export class StaffInAppNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromDispatch(input: CreateStaffInAppNotificationInput) {
    return this.prisma.staffInAppNotification.create({
      data: {
        hospitalId: input.hospitalId,
        branchId: input.branchId ?? null,
        userId: input.userId,
        category: input.category,
        title: input.title,
        body: input.body,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  }

  async listForUser(
    user: StaffUser,
    query: { unreadOnly?: boolean; page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    const where: Prisma.StaffInAppNotificationWhereInput = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      userId: user.sub,
      ...(query.unreadOnly ? { readAt: null } : {}),
    });

    const [total, data] = await this.prisma.$transaction([
      this.prisma.staffInAppNotification.count({ where }),
      this.prisma.staffInAppNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async unreadCount(user: StaffUser) {
    const count = await this.prisma.staffInAppNotification.count({
      where: applyBranchScope(user, {
        hospitalId: user.hospitalId,
        userId: user.sub,
        readAt: null,
      }),
    });
    return { unreadCount: count };
  }

  async markRead(user: StaffUser, id: string) {
    const row = await this.findOwned(user, id);
    if (row.readAt) {
      return row;
    }
    return this.prisma.staffInAppNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(user: StaffUser) {
    const result = await this.prisma.staffInAppNotification.updateMany({
      where: applyBranchScope(user, {
        hospitalId: user.hospitalId,
        userId: user.sub,
        readAt: null,
      }),
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  private async findOwned(user: StaffUser, id: string) {
    const row = await this.prisma.staffInAppNotification.findFirst({
      where: { id, hospitalId: user.hospitalId, userId: user.sub },
    });
    if (!row) {
      throw new NotFoundException('Notification not found');
    }
    if (user.branchId != null && row.branchId != null && row.branchId !== user.branchId) {
      throw new ForbiddenException('Notification is not in your branch scope');
    }
    return row;
  }
}
