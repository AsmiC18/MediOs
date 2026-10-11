import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { INTERNAL_DELIVERY_STATUSES } from '../notification-delivery-stats.types';

export class NotificationDeliveryStatsQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  channel?: string;

  @IsOptional()
  @IsIn([...INTERNAL_DELIVERY_STATUSES])
  status?: (typeof INTERNAL_DELIVERY_STATUSES)[number];
}
