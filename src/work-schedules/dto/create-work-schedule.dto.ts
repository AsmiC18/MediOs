import {
  IsOptional,
  IsString,
  Matches,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

@ValidatorConstraint({ name: 'WorkTimesNotEqual', async: false })
class WorkTimesNotEqualConstraint implements ValidatorConstraintInterface {
  validate(workEndTime: string, args: ValidationArguments): boolean {
    const object = args.object as CreateWorkScheduleDto;
    if (!object.workStartTime || !workEndTime) {
      return true;
    }
    return object.workStartTime !== workEndTime;
  }

  defaultMessage(): string {
    return 'workStartTime and workEndTime must not be equal';
  }
}

export class CreateWorkScheduleDto {
  @IsString()
  @Matches(HH_MM_PATTERN, {
    message: 'workStartTime must be a valid HH:mm time',
  })
  workStartTime: string;

  @IsString()
  @Matches(HH_MM_PATTERN, {
    message: 'workEndTime must be a valid HH:mm time',
  })
  @Validate(WorkTimesNotEqualConstraint)
  workEndTime: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}
