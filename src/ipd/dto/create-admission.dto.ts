import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAdmissionDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  branchId: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsOptional()
  bedId?: string;
}
