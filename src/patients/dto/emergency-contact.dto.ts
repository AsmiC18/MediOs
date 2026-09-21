import { IsOptional, IsString, MinLength } from 'class-validator';

export class EmergencyContactDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsString()
  @IsOptional()
  relationship?: string;
}
