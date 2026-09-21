import { IsOptional, IsString, IsUUID } from 'class-validator';

export class TransferBedDto {
  @IsUUID()
  newBedId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
