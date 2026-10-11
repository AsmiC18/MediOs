import { IsString, MinLength } from 'class-validator';

export class PortalLogoutDto {
  @IsString()
  @MinLength(16)
  refreshToken!: string;
}
