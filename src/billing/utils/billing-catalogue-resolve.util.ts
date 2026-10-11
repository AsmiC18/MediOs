import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { assertBranchAccess } from '../../common/auth/branch-scope.util';
import { CreateInvoiceItemDto } from '../dto/create-invoice-item.dto';
import { assertManualInvoiceItemComplete } from './invoice-item-dto.util';
import { GstItemInput } from './gst.util';

type ResolveUser = {
  hospitalId: string;
  branchId?: string | null;
};

export type ResolvedGstItemInput = GstItemInput & {
  billingCatalogueItemId?: string | null;
  billingCatalogueCode?: string | null;
};

export async function resolveInvoiceItemsFromCatalogue(
  prisma: PrismaClient | Prisma.TransactionClient,
  user: ResolveUser,
  items: CreateInvoiceItemDto[],
): Promise<ResolvedGstItemInput[]> {
  const resolved: ResolvedGstItemInput[] = [];

  for (const item of items) {
    if (!item.billingCatalogueItemId) {
      assertManualInvoiceItemComplete(item);
      resolved.push({
        description: item.description!.trim(),
        quantity: item.quantity,
        unitPrice: item.unitPrice!,
        hsnSac: item.hsnSac,
        gstRate: item.gstRate,
        sortOrder: item.sortOrder,
      });
      continue;
    }

    const catalogue = await prisma.billingCatalogueItem.findFirst({
      where: {
        id: item.billingCatalogueItemId,
        hospitalId: user.hospitalId,
      },
    });

    if (!catalogue) {
      throw new NotFoundException(
        `Billing catalogue item not found: ${item.billingCatalogueItemId}`,
      );
    }

    if (!catalogue.isActive) {
      throw new BadRequestException(
        `Billing catalogue item is inactive: ${catalogue.code}`,
      );
    }

    if (catalogue.branchId) {
      assertBranchAccess(user, catalogue.branchId);
    }

    resolved.push({
      description: catalogue.name,
      quantity: item.quantity,
      unitPrice: Number(catalogue.unitPrice),
      hsnSac: catalogue.hsnSac ?? undefined,
      gstRate: Number(catalogue.gstRate),
      sortOrder: item.sortOrder,
      billingCatalogueItemId: catalogue.id,
      billingCatalogueCode: catalogue.code,
    });
  }

  return resolved;
}
