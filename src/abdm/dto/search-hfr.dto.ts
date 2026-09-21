import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SearchHfrDto {
  @IsString()
  @IsOptional()
  facilityId?: string;

  @IsString()
  @IsOptional()
  facilityName?: string;

  @IsString()
  @IsOptional()
  ownershipCode?: string;

  @IsString()
  @IsOptional()
  stateLGDCode?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;
}
