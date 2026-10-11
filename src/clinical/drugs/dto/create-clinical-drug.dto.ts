import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateClinicalDrugDto {
  @IsString()
  @MinLength(1)
  genericName: string;

  @IsString()
  @IsOptional()
  brandName?: string;

  @IsString()
  @IsOptional()
  strength?: string;

  @IsString()
  @IsOptional()
  dosageForm?: string;

  @IsString()
  @IsOptional()
  route?: string;

  @IsString()
  @IsOptional()
  externalConceptId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ingredients?: string[];

  @IsUUID()
  @IsOptional()
  defaultPharmacyProductId?: string;
}
