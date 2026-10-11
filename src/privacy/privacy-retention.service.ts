import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationStatus,
  WhatsAppMessageStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  loadPrivacyRetentionConfig,
  PrivacyRetentionConfig,
} from './privacy-retention.config';

export type PrivacyRetentionPurgeResult = {
  auditLogsDeleted: number;
  whatsAppMessagesDeleted: number;
  notificationsDeleted: number;
  skipped: boolean;
};

const TERMINAL_WHATSAPP_STATUSES: WhatsAppMessageStatus[] = [
  WhatsAppMessageStatus.SENT,
  WhatsAppMessageStatus.DELIVERED,
  WhatsAppMessageStatus.READ,
  WhatsAppMessageStatus.FAILED,
];

const TERMINAL_NOTIFICATION_STATUSES: NotificationStatus[] = [
  NotificationStatus.DISPATCHED,
  NotificationStatus.FAILED,
  NotificationStatus.CANCELLED,
  NotificationStatus.SKIPPED,
];

@Injectable()
export class PrivacyRetentionService {
  private readonly logger = new Logger(PrivacyRetentionService.name);
  private readonly config: PrivacyRetentionConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    this.config = loadPrivacyRetentionConfig();
  }

  getConfig(): PrivacyRetentionConfig {
    return this.config;
  }

  private cutoffFromDays(days: number, now: Date): Date {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  async purgeForHospital(
    hospitalId: string,
    options?: { now?: Date; jobId?: string },
  ): Promise<PrivacyRetentionPurgeResult> {
    if (!this.config.enabled) {
      return {
        auditLogsDeleted: 0,
        whatsAppMessagesDeleted: 0,
        notificationsDeleted: 0,
        skipped: true,
      };
    }

    const now = options?.now ?? new Date();
    const batchSize = this.config.batchSize;

    const whatsAppMessagesDeleted = await this.deleteWhatsAppMessageBatch(
      hospitalId,
      this.cutoffFromDays(this.config.whatsAppMessageRetentionDays, now),
      batchSize,
    );

    const notificationsDeleted = await this.deleteNotificationBatch(
      hospitalId,
      this.cutoffFromDays(this.config.notificationRetentionDays, now),
      batchSize,
    );

    const auditLogsDeleted = await this.deleteAuditLogBatch(
      hospitalId,
      this.cutoffFromDays(this.config.auditLogRetentionDays, now),
      batchSize,
    );

    if (
      auditLogsDeleted > 0 ||
      whatsAppMessagesDeleted > 0 ||
      notificationsDeleted > 0
    ) {
      await this.auditService.log({
        action: 'PRIVACY_RETENTION_PURGE_COMPLETED',
        entity: 'PrivacyRetentionJob',
        entityId: options?.jobId ?? null,
        hospitalId,
        branchId: null,
        userId: null,
        metadata: {
          jobId: options?.jobId ?? null,
          auditLogsDeleted,
          whatsAppMessagesDeleted,
          notificationsDeleted,
          batchSize,
        },
      });
    }

    this.logger.log(
      JSON.stringify({
        event: 'privacy_retention_purge_completed',
        hospitalId,
        jobId: options?.jobId ?? null,
        auditLogsDeleted,
        whatsAppMessagesDeleted,
        notificationsDeleted,
      }),
    );

    return {
      auditLogsDeleted,
      whatsAppMessagesDeleted,
      notificationsDeleted,
      skipped: false,
    };
  }

  private async deleteAuditLogBatch(
    hospitalId: string,
    cutoff: Date,
    batchSize: number,
  ): Promise<number> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        hospitalId,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.auditLog.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    return result.count;
  }

  private async deleteWhatsAppMessageBatch(
    hospitalId: string,
    cutoff: Date,
    batchSize: number,
  ): Promise<number> {
    const rows = await this.prisma.whatsAppMessage.findMany({
      where: {
        hospitalId,
        createdAt: { lt: cutoff },
        status: { in: TERMINAL_WHATSAPP_STATUSES },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.whatsAppMessage.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    return result.count;
  }

  private async deleteNotificationBatch(
    hospitalId: string,
    cutoff: Date,
    batchSize: number,
  ): Promise<number> {
    const rows = await this.prisma.notification.findMany({
      where: {
        hospitalId,
        createdAt: { lt: cutoff },
        status: { in: TERMINAL_NOTIFICATION_STATUSES },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.notification.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    return result.count;
  }
}
