import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DispensingItemDto } from './create-dispensing.dto';

export class FulfillPrescriptionWorkItemDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DispensingItemDto)
  items!: DispensingItemDto[];

  @IsUUID()
  @IsOptional()
  branchId?: string;
}
