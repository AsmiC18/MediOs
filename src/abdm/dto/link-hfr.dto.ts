import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class LinkHfrDto {
  @IsString()
  hfrId: string;

  @IsBoolean()
  @IsOptional()
  verifyWithRegistry?: boolean;
}
