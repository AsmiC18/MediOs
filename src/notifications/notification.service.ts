import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DomainEventOutbox,
  Notification,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  NOTIFICATION_CHANNEL_EMAIL,
  NOTIFICATION_CHANNEL_IN_APP,
  NOTIFICATION_CHANNEL_UNROUTED,
  NOTIFICATION_CHANNEL_WHATSAPP,
} from './notification.constants';
import { notificationIdempotencyKeyForOutbox } from './notification-idempotency.util';
import { CreateNotificationInput } from './notification.types';

function isRootPrismaClient(
  client: PrismaService | Prisma.TransactionClient,
): client is PrismaService {
  return typeof (client as PrismaService).$connect === 'function';
}

function notificationSavepointName(input: CreateNotificationInput): string {
  const hash = createHash('sha256')
    .update(`${input.hospitalId}|${input.idempotencyKey}`)
    .digest('hex')
    .slice(0, 16);
  return `notif_${hash}`;
}

function extractOptionalPatientId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const patientId = (payload as Record<string, unknown>).patientId;
  return typeof patientId === 'string' && patientId.length > 0 ? patientId : null;
}

function extractOptionalTemplateKey(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const templateKey = (payload as Record<string, unknown>).templateKey;
  return typeof templateKey === 'string' && templateKey.length > 0
    ? templateKey
    : null;
}

function extractChannelFromOutboxPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NOTIFICATION_CHANNEL_UNROUTED;
  }
  const channel = (payload as Record<string, unknown>).channel;
  if (channel === NOTIFICATION_CHANNEL_WHATSAPP) {
    return NOTIFICATION_CHANNEL_WHATSAPP;
  }
  if (channel === NOTIFICATION_CHANNEL_IN_APP) {
    return NOTIFICATION_CHANNEL_IN_APP;
  }
  if (channel === NOTIFICATION_CHANNEL_EMAIL) {
    return NOTIFICATION_CHANNEL_EMAIL;
  }
  return NOTIFICATION_CHANNEL_UNROUTED;
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  async findByIdForHospital(
    id: string,
    hospitalId: string,
  ): Promise<Notification | null> {
    return this.prisma.notification.findFirst({
      where: { id, hospitalId },
    });
  }

  async findByIdempotencyKeyForHospital(
    hospitalId: string,
    idempotencyKey: string,
  ): Promise<Notification | null> {
    return this.prisma.notification.findUnique({
      where: {
        hospitalId_idempotencyKey: { hospitalId, idempotencyKey },
      },
    });
  }

  async findByOutboxIdForHospital(
    outboxId: string,
    hospitalId: string,
  ): Promise<Notification | null> {
    return this.prisma.notification.findFirst({
      where: { outboxId, hospitalId },
    });
  }

  async createOrGetInTransaction(
    client: PrismaService | Prisma.TransactionClient,
    input: CreateNotificationInput,
  ): Promise<Notification> {
    if (isRootPrismaClient(client)) {
      return this.createOrReturnExistingNotification(client, input);
    }

    const savepoint = notificationSavepointName(input);
    await client.$executeRaw(Prisma.raw(`SAVEPOINT "${savepoint}"`));

    try {
      const created = await client.notification.create({
        data: {
          hospitalId: input.hospitalId,
          branchId: input.branchId ?? null,
          patientId: input.patientId ?? null,
          outboxId: input.outboxId ?? null,
          category: input.category,
          channel: input.channel,
          templateKey: input.templateKey ?? null,
          payload: input.payload,
          idempotencyKey: input.idempotencyKey,
          status: NotificationStatus.PENDING,
        },
      });
      await client.$executeRaw(Prisma.raw(`RELEASE SAVEPOINT "${savepoint}"`));
      return created;
    } catch (error) {
      await client.$executeRaw(
        Prisma.raw(`ROLLBACK TO SAVEPOINT "${savepoint}"`),
      );
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await client.notification.findUnique({
          where: {
            hospitalId_idempotencyKey: {
              hospitalId: input.hospitalId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  private async createOrReturnExistingNotification(
    client: PrismaService | Prisma.TransactionClient,
    input: CreateNotificationInput,
  ): Promise<Notification> {
    try {
      return await client.notification.create({
        data: {
          hospitalId: input.hospitalId,
          branchId: input.branchId ?? null,
          patientId: input.patientId ?? null,
          outboxId: input.outboxId ?? null,
          category: input.category,
          channel: input.channel,
          templateKey: input.templateKey ?? null,
          payload: input.payload,
          idempotencyKey: input.idempotencyKey,
          status: NotificationStatus.PENDING,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await client.notification.findUnique({
          where: {
            hospitalId_idempotencyKey: {
              hospitalId: input.hospitalId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /**
   * Builds a Notification from an outbox row (H2: channel unrouted, status PENDING).
   * Does not deliver to WhatsApp or any external provider.
   */
  async createOrGetFromOutboxInTransaction(
    client: Prisma.TransactionClient,
    outbox: DomainEventOutbox,
  ): Promise<Notification> {
    if (outbox.branchId) {
      const branch = await client.branch.findFirst({
        where: { id: outbox.branchId, hospitalId: outbox.hospitalId },
      });
      if (!branch) {
        throw new JobPermanentFailureError(
          'Outbox branch does not belong to outbox hospital',
        );
      }
    }

    const patientIdFromPayload = extractOptionalPatientId(outbox.payload);
    if (patientIdFromPayload) {
      const patient = await client.patient.findFirst({
        where: { id: patientIdFromPayload, hospitalId: outbox.hospitalId },
      });
      if (!patient) {
        throw new JobPermanentFailureError(
          'Outbox payload patientId does not belong to outbox hospital',
        );
      }
    }

    const templateKey = extractOptionalTemplateKey(outbox.payload);
    const channel = extractChannelFromOutboxPayload(outbox.payload);

    return this.createOrGetInTransaction(client, {
      hospitalId: outbox.hospitalId,
      branchId: outbox.branchId,
      patientId: patientIdFromPayload,
      outboxId: outbox.id,
      category: outbox.eventType,
      channel,
      templateKey,
      idempotencyKey: notificationIdempotencyKeyForOutbox(outbox.id),
      payload: {
        source: 'domain_event_outbox',
        eventType: outbox.eventType,
        entityType: outbox.entityType,
        entityId: outbox.entityId,
        data: outbox.payload,
      },
    });
  }

  async markDispatched(
    notificationId: string,
    hospitalId: string,
    client?: Prisma.TransactionClient,
  ): Promise<Notification> {
    const db = client ?? this.prisma;
    const now = new Date();
    const updated = await db.notification.updateMany({
      where: {
        id: notificationId,
        hospitalId,
        status: NotificationStatus.PENDING,
      },
      data: {
        status: NotificationStatus.DISPATCHED,
        dispatchedAt: now,
      },
    });

    if (updated.count !== 1) {
      throw new NotFoundException(
        'Notification not found or not pending for hospital',
      );
    }

    return db.notification.findFirstOrThrow({
      where: { id: notificationId, hospitalId },
    });
  }

  /** Marks PENDING as DISPATCHED, or returns row if already DISPATCHED (safe rerun). */
  async markDispatchedIfPending(
    notificationId: string,
    hospitalId: string,
    client: Prisma.TransactionClient,
  ): Promise<Notification> {
    const updated = await client.notification.updateMany({
      where: {
        id: notificationId,
        hospitalId,
        status: NotificationStatus.PENDING,
      },
      data: {
        status: NotificationStatus.DISPATCHED,
        dispatchedAt: new Date(),
      },
    });

    if (updated.count === 1) {
      return client.notification.findFirstOrThrow({
        where: { id: notificationId, hospitalId },
      });
    }

    const row = await client.notification.findFirst({
      where: { id: notificationId, hospitalId },
    });
    if (!row) {
      throw new NotFoundException('Notification not found for hospital');
    }
    if (row.status === NotificationStatus.DISPATCHED) {
      return row;
    }
    throw new NotFoundException('Notification not pending for hospital');
  }

  async markFailed(
    notificationId: string,
    hospitalId: string,
    lastError: string,
    client?: Prisma.TransactionClient,
  ): Promise<Notification> {
    const db = client ?? this.prisma;
    const now = new Date();
    const updated = await db.notification.updateMany({
      where: {
        id: notificationId,
        hospitalId,
        status: {
          in: [NotificationStatus.PENDING, NotificationStatus.DISPATCHED],
        },
      },
      data: {
        status: NotificationStatus.FAILED,
        failedAt: now,
        lastError,
      },
    });

    if (updated.count !== 1) {
      throw new NotFoundException(
        'Notification not found or not eligible for failure for hospital',
      );
    }

    return db.notification.findFirstOrThrow({
      where: { id: notificationId, hospitalId },
    });
  }

  async markSkipped(
    notificationId: string,
    hospitalId: string,
    lastError?: string,
    client?: Prisma.TransactionClient,
  ): Promise<Notification> {
    const db = client ?? this.prisma;
    const updated = await db.notification.updateMany({
      where: {
        id: notificationId,
        hospitalId,
        status: NotificationStatus.PENDING,
      },
      data: {
        status: NotificationStatus.SKIPPED,
        ...(lastError ? { lastError } : {}),
      },
    });

    if (updated.count !== 1) {
      throw new NotFoundException(
        'Notification not found or not pending for hospital',
      );
    }

    return db.notification.findFirstOrThrow({
      where: { id: notificationId, hospitalId },
    });
  }

  async markCancelled(
    notificationId: string,
    hospitalId: string,
    client?: Prisma.TransactionClient,
  ): Promise<Notification> {
    const db = client ?? this.prisma;
    const now = new Date();
    const updated = await db.notification.updateMany({
      where: {
        id: notificationId,
        hospitalId,
        status: NotificationStatus.PENDING,
      },
      data: {
        status: NotificationStatus.CANCELLED,
        cancelledAt: now,
      },
    });

    if (updated.count !== 1) {
      throw new NotFoundException(
        'Notification not found or not pending for hospital',
      );
    }

    return db.notification.findFirstOrThrow({
      where: { id: notificationId, hospitalId },
    });
  }
}
