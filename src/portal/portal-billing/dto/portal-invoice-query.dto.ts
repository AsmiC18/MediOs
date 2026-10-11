import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { InvoiceStatus } from '@prisma/client';

export class PortalInvoiceQueryDto {
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
