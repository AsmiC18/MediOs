import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  DomainEventOutboxStatus,
  JobStatus,
  Notification,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { NotificationDeliveryStatsQueryDto } from './dto/notification-delivery-stats-query.dto';
import {
  INTERNAL_DELIVERY_STATUSES,
  InternalDeliveryStatus,
  NotificationDeliveryStatsResponse,
} from './notification-delivery-stats.types';

type StatsUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class NotificationDeliveryStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getStats(
    user: StatsUser,
    query: NotificationDeliveryStatsQueryDto,
  ): Promise<NotificationDeliveryStatsResponse> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (!(from < to)) {
      throw new ForbiddenException('Invalid date range');
    }

    let effectiveBranchId: string | null = user.branchId ?? null;
    if (user.branchId == null && query.branchId) {
      assertBranchAccess(user, query.branchId);
      effectiveBranchId = query.branchId;
    }

    const where: Prisma.NotificationWhereInput = applyBranchScope(user, {
      hospitalId: user.hospitalId,
      createdAt: { gte: from, lt: to },
      ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
    });

    const notifications = await this.prisma.notification.findMany({
      where,
      select: {
        id: true,
        status: true,
        channel: true,
        outboxId: true,
        lastError: true,
      },
    });

    const outboxWhere: Prisma.DomainEventOutboxWhereInput = applyBranchScope(
      user,
      {
        hospitalId: user.hospitalId,
        createdAt: { gte: from, lt: to },
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        notification: { is: null },
        status: {
          in: [
            DomainEventOutboxStatus.PENDING,
            DomainEventOutboxStatus.FAILED,
          ],
        },
      },
    );

    const pendingOutboxRows = await this.prisma.domainEventOutbox.findMany({
      where: outboxWhere,
      select: { status: true, payload: true },
    });

    const outboxIds = notifications
      .map((n) => n.outboxId)
      .filter((id): id is string => id != null);

    const jobs =
      outboxIds.length === 0
        ? []
        : await this.prisma.job.findMany({
            where: {
              hospitalId: user.hospitalId,
              type: JOB_TYPES.NOTIFICATION_DISPATCH,
              idempotencyKey: {
                in: outboxIds.map((id) => `notification.dispatch:${id}`),
              },
            },
            select: {
              idempotencyKey: true,
              status: true,
              attempts: true,
            },
          });

    const jobByOutboxId = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) {
      const prefix = 'notification.dispatch:';
      if (job.idempotencyKey.startsWith(prefix)) {
        jobByOutboxId.set(job.idempotencyKey.slice(prefix.length), job);
      }
    }

    const totals = emptyTotals();

    for (const notification of notifications) {
      const job = notification.outboxId
        ? jobByOutboxId.get(notification.outboxId)
        : undefined;
      const derived = deriveInternalDeliveryStatus(notification, job);
      if (query.status && derived !== query.status) {
        continue;
      }
      totals[derived] += 1;
    }

    for (const outboxRow of pendingOutboxRows) {
      if (query.channel) {
        const payloadChannel = readPayloadChannel(outboxRow.payload);
        if (payloadChannel !== query.channel) {
          continue;
        }
      }
      const derived = deriveOutboxQueueStatus(outboxRow.status);
      if (!derived) {
        continue;
      }
      if (query.status && derived !== query.status) {
        continue;
      }
      totals[derived] += 1;
    }

    const totalRows = query.status
      ? totals[query.status]
      : Object.values(totals).reduce((a, b) => a + b, 0);

    await this.auditService.log({
      action: 'NOTIFICATION_DELIVERY_STATS_READ',
      entity: 'Notification',
      entityId: null,
      hospitalId: user.hospitalId,
      branchId: effectiveBranchId,
      userId: user.sub,
      metadata: {
        from: query.from,
        to: query.to,
        channel: query.channel ?? null,
        statusFilter: query.status ?? null,
        totalRows,
      },
    });

    return {
      from: query.from,
      to: query.to,
      branchId: effectiveBranchId,
      channel: query.channel ?? null,
      statusFilter: query.status ?? null,
      totals,
      totalRows,
    };
  }
}

function emptyTotals(): Record<InternalDeliveryStatus, number> {
  return INTERNAL_DELIVERY_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<InternalDeliveryStatus, number>,
  );
}

export function deriveInternalDeliveryStatus(
  notification: Pick<Notification, 'status' | 'lastError'>,
  job?: { status: JobStatus; attempts: number },
): InternalDeliveryStatus {
  if (notification.status === NotificationStatus.DISPATCHED) {
    return 'sent';
  }

  if (
    notification.status === NotificationStatus.FAILED ||
    notification.status === NotificationStatus.CANCELLED ||
    notification.status === NotificationStatus.SKIPPED
  ) {
    if (job?.status === JobStatus.PENDING && (job.attempts ?? 0) > 1) {
      return 'retrying';
    }
    return 'failed';
  }

  if (job?.status === JobStatus.RUNNING) {
    return 'processing';
  }

  if (job?.status === JobStatus.PENDING && (job.attempts ?? 0) > 1) {
    return 'retrying';
  }

  if (job?.status === JobStatus.DEAD) {
    return 'failed';
  }

  if (
    notification.lastError?.toLowerCase().includes('uncertain') ||
    notification.status === NotificationStatus.PENDING &&
      job?.status === JobStatus.COMPLETED
  ) {
    return 'uncertain';
  }

  if (notification.status === NotificationStatus.PENDING) {
    return job?.status === JobStatus.PENDING || !job ? 'queued' : 'processing';
  }

  return 'uncertain';
}

/** Outbox-only rows without a notification yet count as queued. */
function readPayloadChannel(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const channel = (payload as Record<string, unknown>).channel;
  return typeof channel === 'string' ? channel : null;
}

export function deriveOutboxQueueStatus(
  status: DomainEventOutboxStatus,
): InternalDeliveryStatus | null {
  if (status === DomainEventOutboxStatus.PENDING) {
    return 'queued';
  }
  if (status === DomainEventOutboxStatus.FAILED) {
    return 'failed';
  }
  return null;
}
