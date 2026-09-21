import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class RosterEntryQueryDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @IsDateString()
  @IsOptional()
  toDate?: string;
}
