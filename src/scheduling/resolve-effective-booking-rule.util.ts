import { BookingRule, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export async function resolveEffectiveBookingRule(
  client: PrismaService | Prisma.TransactionClient,
  hospitalId: string,
  branchId?: string | null,
): Promise<BookingRule | null> {
  if (branchId) {
    const branch = await client.branch.findUnique({
      where: { id: branchId },
      include: { bookingRule: true },
    });

    if (!branch || branch.hospitalId !== hospitalId) {
      return null;
    }

    if (branch.bookingRule) {
      if (branch.bookingRule.hospitalId !== hospitalId) {
        return null;
      }
      return branch.bookingRule;
    }
  }

  const hospital = await client.hospital.findUnique({
    where: { id: hospitalId },
    include: { defaultBookingRule: true },
  });

  if (!hospital?.defaultBookingRule) {
    return null;
  }

  if (hospital.defaultBookingRule.hospitalId !== hospitalId) {
    return null;
  }

  return hospital.defaultBookingRule;
}
