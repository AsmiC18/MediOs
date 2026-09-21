import { EmergencyDisposition } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetDispositionDto {
  @IsEnum(EmergencyDisposition)
  disposition: EmergencyDisposition;
}
