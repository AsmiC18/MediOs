import { IsString, MinLength } from 'class-validator';

export class PortalRefreshDto {
  @IsString()
  @MinLength(16)
  refreshToken!: string;
}
