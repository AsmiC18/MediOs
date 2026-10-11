import { ClinicalAttachmentCategory } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadClinicalAttachmentDto {
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsEnum(ClinicalAttachmentCategory)
  @IsOptional()
  category?: ClinicalAttachmentCategory;
}
