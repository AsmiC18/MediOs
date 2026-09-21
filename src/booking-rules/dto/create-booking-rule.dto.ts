import {
  IsInt,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'MinDurationNotGreaterThanMax', async: false })
class MinDurationNotGreaterThanMaxConstraint
  implements ValidatorConstraintInterface
{
  validate(maxDurationMinutes: number, args: ValidationArguments): boolean {
    const object = args.object as CreateBookingRuleDto;
    if (
      object.minDurationMinutes === undefined ||
      maxDurationMinutes === undefined
    ) {
      return true;
    }
    return object.minDurationMinutes <= maxDurationMinutes;
  }

  defaultMessage(): string {
    return 'minDurationMinutes must be less than or equal to maxDurationMinutes';
  }
}

export class CreateBookingRuleDto {
  @IsInt()
  @Min(1)
  minDurationMinutes: number;

  @IsInt()
  @Min(1)
  @Validate(MinDurationNotGreaterThanMaxConstraint)
  maxDurationMinutes: number;

  @IsInt()
  @Min(1)
  slotDurationMinutes: number;
}
