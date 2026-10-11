import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectPatientPrivacyErasureDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
