import { IsUUID } from 'class-validator';

export class CheckInDto {
  @IsUUID()
  appointmentId: string;
}
