import { IsEnum } from 'class-validator';
import { InvoiceStatus } from '@prisma/client';

export class UpdateInvoiceStatusDto {
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus;
}
