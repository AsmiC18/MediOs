import { IsOptional, IsString } from 'class-validator';

export class VerifyAbhaDto {
  @IsString()
  @IsOptional()
  mockOtp?: string;
}
