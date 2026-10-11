import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateCheckoutIntentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
