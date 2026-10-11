import { PharmacyDispensingStatus, Prisma } from '@prisma/client';
import { roundMoney } from '../billing/utils/money.util';
import {
  PHARMACY_SHRINK_MOVEMENT_TYPES,
} from './pharmacy-shrink.util';

export type PharmacySalesSummary = {
  from: string;
  to: string;
  branchId: string | null;
  dispensingCount: number;
  lineCount: number;
  totalQuantity: number;
  grossSales: string;
};

export type PharmacyInventorySummary = {
  asOf: string;
  branchId: string | null;
  activeProductCount: number;
  totalOnHandQuantity: number;
  lowStockProductCount: number;
  expiredBatchCount: number;
  expiringWithin30DaysBatchCount: number;
  shrinkageQuantity: number;
};

export async function buildPharmacySalesSummary(
  prisma: Prisma.TransactionClient | { pharmacyDispensing: Prisma.DefaultPrismaClient['pharmacyDispensing'] },
  input: {
    hospitalId: string;
    branchId?: string | null;
    from: string;
    to: string;
  },
): Promise<PharmacySalesSummary> {
  const where: Prisma.PharmacyDispensingWhereInput = {
    hospitalId: input.hospitalId,
    status: PharmacyDispensingStatus.DISPENSED,
    dispensedAt: {
      gte: new Date(input.from),
      lt: new Date(input.to),
    },
  };

  if (input.branchId != null) {
    where.branchId = input.branchId;
  }

  const dispensings = await prisma.pharmacyDispensing.findMany({
    where,
    include: { items: true },
  });

  let lineCount = 0;
  let totalQuantity = 0;
  let gross = 0;

  for (const dispensing of dispensings) {
    for (const item of dispensing.items) {
      lineCount += 1;
      totalQuantity += item.quantity;
      gross += item.unitPrice.toNumber() * item.quantity;
    }
  }

  return {
    from: input.from,
    to: input.to,
    branchId: input.branchId ?? null,
    dispensingCount: dispensings.length,
    lineCount,
    totalQuantity,
    grossSales: roundMoney(new Prisma.Decimal(gross)).toFixed(2),
  };
}

export async function buildPharmacyInventorySummary(
  prisma: Prisma.TransactionClient | {
    pharmacyProduct: Prisma.DefaultPrismaClient['pharmacyProduct'];
    pharmacyBatch: Prisma.DefaultPrismaClient['pharmacyBatch'];
    pharmacyStockMovement: Prisma.DefaultPrismaClient['pharmacyStockMovement'];
  },
  input: {
    hospitalId: string;
    branchId?: string | null;
    from: string;
    to: string;
  },
): Promise<PharmacyInventorySummary> {
  const productWhere: Prisma.PharmacyProductWhereInput = {
    hospitalId: input.hospitalId,
    isActive: true,
  };
  const batchWhere: Prisma.PharmacyBatchWhereInput = {
    hospitalId: input.hospitalId,
  };

  if (input.branchId != null) {
    productWhere.branchId = input.branchId;
    batchWhere.branchId = input.branchId;
  }

  const products = await prisma.pharmacyProduct.findMany({
    where: productWhere,
    select: { id: true, reorderLevel: true },
  });

  const batches = await prisma.pharmacyBatch.findMany({
    where: batchWhere,
    select: { productId: true, quantity: true, expiryDate: true },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const in30 = new Date(today);
  in30.setUTCDate(in30.getUTCDate() + 30);

  let totalOnHandQuantity = 0;
  let expiredBatchCount = 0;
  let expiringWithin30DaysBatchCount = 0;

  const stockByProduct = new Map<string, number>();

  for (const batch of batches) {
    totalOnHandQuantity += batch.quantity;
    stockByProduct.set(
      batch.productId,
      (stockByProduct.get(batch.productId) ?? 0) + batch.quantity,
    );

    const expiryDay = new Date(batch.expiryDate);
    expiryDay.setUTCHours(0, 0, 0, 0);

    if (batch.quantity > 0 && expiryDay < today) {
      expiredBatchCount += 1;
    } else if (batch.quantity > 0 && expiryDay <= in30) {
      expiringWithin30DaysBatchCount += 1;
    }
  }

  let lowStockProductCount = 0;
  for (const product of products) {
    if (product.reorderLevel <= 0) {
      continue;
    }
    const onHand = stockByProduct.get(product.id) ?? 0;
    if (onHand <= product.reorderLevel) {
      lowStockProductCount += 1;
    }
  }

  const shrinkageAgg = await prisma.pharmacyStockMovement.aggregate({
    where: {
      hospitalId: input.hospitalId,
      movementType: {
        in: PHARMACY_SHRINK_MOVEMENT_TYPES,
      },
      createdAt: {
        gte: new Date(input.from),
        lt: new Date(input.to),
      },
      ...(input.branchId != null ? { branchId: input.branchId } : {}),
    },
    _sum: { quantity: true },
  });

  return {
    asOf: new Date().toISOString(),
    branchId: input.branchId ?? null,
    activeProductCount: products.length,
    totalOnHandQuantity,
    lowStockProductCount,
    expiredBatchCount,
    expiringWithin30DaysBatchCount,
    shrinkageQuantity: shrinkageAgg._sum.quantity ?? 0,
  };
}
