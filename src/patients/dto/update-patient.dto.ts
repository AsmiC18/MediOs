import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Gender } from '@prisma/client';
import { EmergencyContactDto } from './emergency-contact.dto';

export class UpdatePatientDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  phone?: string;

  @IsString()
  @MinLength(2)
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsString()
  @IsOptional()
  abhaId?: string;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergies?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  chronicConditions?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  @IsOptional()
  emergencyContacts?: EmergencyContactDto[];
}
