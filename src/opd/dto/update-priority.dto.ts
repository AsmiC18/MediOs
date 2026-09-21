import { IsEnum } from 'class-validator';
import { OpdQueuePriority } from '@prisma/client';

export class UpdatePriorityDto {
  @IsEnum(OpdQueuePriority)
  priority: OpdQueuePriority;
}
