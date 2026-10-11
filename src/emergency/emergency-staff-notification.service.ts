import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { StaffInAppNotificationService } from '../notifications/staff-in-app-notification.service';
import { EMERGENCY_VISIT_ESCALATED_EVENT_TYPE } from './emergency-visit-escalated-event.util';

@Injectable()
export class EmergencyStaffNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffInAppNotificationService: StaffInAppNotificationService,
  ) {}

  async notifyEscalation(input: {
    hospitalId: string;
    branchId: string | null;
    emergencyVisitId: string;
    triageRecordId: string;
    summary: string;
    excludeUserId?: string;
  }): Promise<number> {
    const permission = await this.prisma.permission.findUnique({
      where: { name: 'emergency:read' },
    });
    if (!permission) {
      return 0;
    }

    const roleLinks = await this.prisma.rolePermission.findMany({
      where: { permissionId: permission.id },
      select: { roleId: true },
    });
    const roleIds = [...new Set(roleLinks.map((r) => r.roleId))];
    if (roleIds.length === 0) {
      return 0;
    }

    const users = await this.prisma.user.findMany({
      where: {
        hospitalId: input.hospitalId,
        roleId: { in: roleIds },
        status: UserStatus.ACTIVE,
        ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
        ...(input.branchId
          ? { OR: [{ branchId: input.branchId }, { branchId: null }] }
          : {}),
      },
      select: { id: true },
    });

    let created = 0;
    for (const user of users) {
      await this.staffInAppNotificationService.createFromDispatch({
        hospitalId: input.hospitalId,
        branchId: input.branchId,
        userId: user.id,
        category: EMERGENCY_VISIT_ESCALATED_EVENT_TYPE,
        title: 'Emergency visit escalated',
        body: input.summary,
        entityType: 'TriageRecord',
        entityId: input.triageRecordId,
      });
      created += 1;
    }
    return created;
  }
}
