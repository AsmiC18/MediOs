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
import { hasTaxedItems, validateStateCode } from '../utils/gst.util';
import { gstItemsForTaxValidation } from '../utils/invoice-item-dto.util';
import { CreateInvoiceItemDto } from './create-invoice-item.dto';

@ValidatorConstraint({ name: 'UpdatePlaceOfSupplyWhenTaxed', async: false })
class UpdatePlaceOfSupplyWhenTaxedConstraint
  implements ValidatorConstraintInterface
{
  validate(
    placeOfSupplyStateCode: string | undefined,
    args: ValidationArguments,
  ): boolean {
    const object = args.object as UpdateInvoiceDto;

    if (!object.items || !hasTaxedItems(gstItemsForTaxValidation(object.items))) {
      return true;
    }

    if (placeOfSupplyStateCode === undefined) {
      return true;
    }

    return validateStateCode(placeOfSupplyStateCode);
  }

  defaultMessage(): string {
    return 'placeOfSupplyStateCode must be a valid 2-digit GST state code';
  }
}

export class UpdateInvoiceDto {
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
  @Validate(UpdatePlaceOfSupplyWhenTaxedConstraint)
  placeOfSupplyStateCode?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  @IsOptional()
  items?: CreateInvoiceItemDto[];
}
