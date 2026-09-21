import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { validateStateCode, hasTaxedItems } from '../utils/gst.util';
import { CreateInvoiceItemDto } from './create-invoice-item.dto';

@ValidatorConstraint({ name: 'PlaceOfSupplyWhenTaxed', async: false })
class PlaceOfSupplyWhenTaxedConstraint implements ValidatorConstraintInterface {
  validate(
    placeOfSupplyStateCode: string | undefined,
    args: ValidationArguments,
  ): boolean {
    const object = args.object as CreateInvoiceDto;

    if (!hasTaxedItems(object.items ?? [])) {
      return true;
    }

    return (
      typeof placeOfSupplyStateCode === 'string' &&
      validateStateCode(placeOfSupplyStateCode)
    );
  }

  defaultMessage(): string {
    return 'placeOfSupplyStateCode is required and must be a valid 2-digit GST state code when any item has GST';
  }
}

export class CreateInvoiceDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(0[1-9]|[1-3][0-7])$/, {
    message: 'placeOfSupplyStateCode must be a valid 2-digit GST state code',
  })
  @Validate(PlaceOfSupplyWhenTaxedConstraint)
  placeOfSupplyStateCode?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];
}
