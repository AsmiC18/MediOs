import { IsString, MinLength } from 'class-validator';

export class PortalLoginDto {
  @IsString()
  @MinLength(1)
  hospitalCode!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
