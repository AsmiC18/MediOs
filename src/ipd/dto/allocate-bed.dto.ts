import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AllocateBedDto {
  @IsUUID()
  bedId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
