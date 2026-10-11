import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectRefundDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  rejectionReason!: string;
}
