import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class PortalUpdateAppointmentDto {
  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  @IsOptional()
  resourceIds?: string[];

  @IsString()
  @IsOptional()
  reason?: string;
}
