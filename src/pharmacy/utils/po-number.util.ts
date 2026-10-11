import { Prisma } from '@prisma/client';

export async function generatePurchaseOrderNumber(
  tx: Prisma.TransactionClient,
  hospitalId: string,
): Promise<string> {
  const latest = await tx.pharmacyPurchaseOrder.findFirst({
    where: { hospitalId },
    orderBy: { poNumber: 'desc' },
    select: { poNumber: true },
  });

  let sequence = 1;

  if (latest?.poNumber) {
    const match = /^PO-(\d+)$/.exec(latest.poNumber);
    if (match) {
      sequence = parseInt(match[1], 10) + 1;
    }
  }

  return `PO-${String(sequence).padStart(6, '0')}`;
}
