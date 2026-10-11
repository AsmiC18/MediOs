import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'PortalIsEndAfterStart', async: false })
class PortalIsEndAfterStartConstraint implements ValidatorConstraintInterface {
  validate(endAt: string, args: ValidationArguments): boolean {
    const object = args.object as PortalCreateAppointmentDto;
    if (!object.startAt || !endAt) {
      return true;
    }
    return new Date(endAt) > new Date(object.startAt);
  }

  defaultMessage(): string {
    return 'endAt must be after startAt';
  }
}

export class PortalCreateAppointmentDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  @Validate(PortalIsEndAfterStartConstraint)
  endAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  resourceIds!: string[];

  @IsString()
  @IsOptional()
  reason?: string;
}
