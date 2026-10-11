import { PharmacyStockMovementType, Prisma } from '@prisma/client';

/** Movement types counted as inventory shrinkage (quantity sum). */
export const PHARMACY_SHRINK_MOVEMENT_TYPES: PharmacyStockMovementType[] = [
  PharmacyStockMovementType.ADJUSTMENT_OUT,
  PharmacyStockMovementType.EXPIRED,
];

export type PharmacyShrinkByType = {
  movementType: PharmacyStockMovementType;
  quantity: number;
};

export type PharmacyShrinkSummary = {
  from: string;
  to: string;
  branchId: string | null;
  totalShrinkQuantity: number;
  movementTypesIncluded: PharmacyStockMovementType[];
  byMovementType: PharmacyShrinkByType[];
};

export async function buildPharmacyShrinkSummary(
  prisma: {
    pharmacyStockMovement: {
      groupBy: (
        args: Prisma.PharmacyStockMovementGroupByArgs,
      ) => Promise<
        Array<{
          movementType: PharmacyStockMovementType;
          _sum: { quantity: number | null };
        }>
      >;
    };
  },
  input: {
    hospitalId: string;
    branchId?: string | null;
    from: string;
    to: string;
  },
): Promise<PharmacyShrinkSummary> {
  const groups = await prisma.pharmacyStockMovement.groupBy({
    by: ['movementType'],
    where: {
      hospitalId: input.hospitalId,
      movementType: { in: PHARMACY_SHRINK_MOVEMENT_TYPES },
      createdAt: {
        gte: new Date(input.from),
        lt: new Date(input.to),
      },
      ...(input.branchId != null ? { branchId: input.branchId } : {}),
    },
    _sum: { quantity: true },
  });

  const byMovementType: PharmacyShrinkByType[] = PHARMACY_SHRINK_MOVEMENT_TYPES.map(
    (movementType) => {
      const row = groups.find((g) => g.movementType === movementType);
      return {
        movementType,
        quantity: row?._sum.quantity ?? 0,
      };
    },
  );

  const totalShrinkQuantity = byMovementType.reduce((sum, row) => sum + row.quantity, 0);

  return {
    from: input.from,
    to: input.to,
    branchId: input.branchId ?? null,
    totalShrinkQuantity,
    movementTypesIncluded: [...PHARMACY_SHRINK_MOVEMENT_TYPES],
    byMovementType,
  };
}
