import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { NOTIFICATION_CHANNEL_UNROUTED } from '../../notifications/notification.constants';
import { startOfUtcDay } from '../utils/fefo.util';
import {
  PHARMACY_BATCH_EXPIRED_EVENT_TYPE,
  PHARMACY_BATCH_EXPIRING_EVENT_TYPE,
  PHARMACY_LOW_STOCK_EVENT_TYPE,
  pharmacyBatchExpiryOutboxKey,
  pharmacyLowStockOutboxKey,
} from './pharmacy-inventory-alert.constants';

export type PharmacyInventoryScanResult = {
  lowStockAlertsCreated: number;
  expiryAlertsCreated: number;
};

@Injectable()
export class PharmacyInventoryScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
  ) {}

  async scanLowStock(
    hospitalId: string,
    windowKey: string,
  ): Promise<{ alertsCreated: number }> {
    const products = await this.prisma.pharmacyProduct.findMany({
      where: {
        hospitalId,
        isActive: true,
        reorderLevel: { gt: 0 },
      },
      select: { id: true, name: true, branchId: true, reorderLevel: true, unit: true },
    });

    let alertsCreated = 0;

    for (const product of products) {
      const batchWhere: Prisma.PharmacyBatchWhereInput = {
        hospitalId,
        productId: product.id,
        quantity: { gt: 0 },
      };

      if (product.branchId) {
        batchWhere.branchId = product.branchId;
      }

      const aggregate = await this.prisma.pharmacyBatch.aggregate({
        where: batchWhere,
        _sum: { quantity: true },
      });

      const available = aggregate._sum.quantity ?? 0;

      if (available > product.reorderLevel) {
        continue;
      }

      const idempotencyKey = pharmacyLowStockOutboxKey({
        hospitalId,
        branchId: product.branchId,
        productId: product.id,
        windowKey,
      });

      const created = await this.createAlertIfAbsent({
        hospitalId,
        branchId: product.branchId,
        eventType: PHARMACY_LOW_STOCK_EVENT_TYPE,
        entityType: 'PharmacyProduct',
        entityId: product.id,
        idempotencyKey,
        payload: {
          productId: product.id,
          productName: product.name,
          availableStock: available,
          reorderLevel: product.reorderLevel,
          unit: product.unit,
          channel: NOTIFICATION_CHANNEL_UNROUTED,
        },
      });

      if (created) {
        alertsCreated += 1;
      }
    }

    return { alertsCreated };
  }

  async scanExpiry(
    hospitalId: string,
    windowKey: string,
    warningDays: number,
  ): Promise<{ alertsCreated: number }> {
    const today = startOfUtcDay();
    const warningEnd = new Date(today);
    warningEnd.setUTCDate(warningEnd.getUTCDate() + warningDays);

    const batches = await this.prisma.pharmacyBatch.findMany({
      where: {
        hospitalId,
        quantity: { gt: 0 },
        expiryDate: { lte: warningEnd },
      },
      select: {
        id: true,
        branchId: true,
        productId: true,
        batchNumber: true,
        expiryDate: true,
        quantity: true,
        product: { select: { name: true } },
      },
    });

    let alertsCreated = 0;

    for (const batch of batches) {
      const expiryDay = startOfUtcDay(batch.expiryDate);
      const isExpired = expiryDay < today;
      const eventType = isExpired
        ? PHARMACY_BATCH_EXPIRED_EVENT_TYPE
        : PHARMACY_BATCH_EXPIRING_EVENT_TYPE;
      const kind = isExpired ? 'expired' : 'expiring';

      const idempotencyKey = pharmacyBatchExpiryOutboxKey({
        hospitalId,
        batchId: batch.id,
        kind,
        windowKey,
      });

      const created = await this.createAlertIfAbsent({
        hospitalId,
        branchId: batch.branchId,
        eventType,
        entityType: 'PharmacyBatch',
        entityId: batch.id,
        idempotencyKey,
        payload: {
          batchId: batch.id,
          productId: batch.productId,
          productName: batch.product.name,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate.toISOString(),
          quantity: batch.quantity,
          alertKind: kind,
          channel: NOTIFICATION_CHANNEL_UNROUTED,
        },
      });

      if (created) {
        alertsCreated += 1;
      }
    }

    return { alertsCreated };
  }

  private async createAlertIfAbsent(input: {
    hospitalId: string;
    branchId: string | null;
    eventType: string;
    entityType: string;
    entityId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const outbox = await this.domainEventOutboxService.createInTransaction(tx, {
          hospitalId: input.hospitalId,
          branchId: input.branchId,
          eventType: input.eventType,
          entityType: input.entityType,
          entityId: input.entityId,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload as Prisma.InputJsonValue,
        });

        await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
          hospitalId: input.hospitalId,
          branchId: input.branchId,
          outboxId: outbox.id,
        });
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }
}
