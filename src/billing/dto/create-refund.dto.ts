import { IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class CreateRefundDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
