import { BadRequestException } from '@nestjs/common';
import { CreateInvoiceItemDto } from '../dto/create-invoice-item.dto';
import { GstItemInput } from './gst.util';

/** Maps DTO lines to GST check inputs before catalogue resolution. */
export function gstItemsForTaxValidation(
  items: CreateInvoiceItemDto[],
): GstItemInput[] {
  return items.map((item) => ({
    description: item.description ?? item.billingCatalogueItemId ?? 'line',
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? 0,
    hsnSac: item.hsnSac,
    gstRate: item.gstRate,
  }));
}

export function assertManualInvoiceItemComplete(item: CreateInvoiceItemDto): void {
  if (item.billingCatalogueItemId) {
    return;
  }
  if (!item.description?.trim()) {
    throw new BadRequestException('Manual invoice lines require description');
  }
  if (item.unitPrice == null || item.unitPrice < 0) {
    throw new BadRequestException('Manual invoice lines require unitPrice');
  }
}
