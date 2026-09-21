import { IsOptional, IsString } from 'class-validator';

export class LinkAbhaDto {
  @IsString()
  @IsOptional()
  abhaNumber?: string;

  @IsString()
  @IsOptional()
  abhaAddress?: string;
}
