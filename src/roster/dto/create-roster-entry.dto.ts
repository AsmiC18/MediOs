import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

@ValidatorConstraint({ name: 'ShiftEndAfterStart', async: false })
class ShiftEndAfterStartConstraint implements ValidatorConstraintInterface {
  validate(shiftEndTime: string, args: ValidationArguments): boolean {
    const object = args.object as CreateRosterEntryDto;
    if (!object.shiftStartTime || !shiftEndTime) {
      return true;
    }
    return object.shiftStartTime < shiftEndTime;
  }

  defaultMessage(): string {
    return 'shiftStartTime must be before shiftEndTime';
  }
}

export class CreateRosterEntryDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  date: string;

  @IsString()
  @Matches(HH_MM_PATTERN, {
    message: 'shiftStartTime must be a valid HH:mm time',
  })
  shiftStartTime: string;

  @IsString()
  @Matches(HH_MM_PATTERN, {
    message: 'shiftEndTime must be a valid HH:mm time',
  })
  @Validate(ShiftEndAfterStartConstraint)
  shiftEndTime: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
