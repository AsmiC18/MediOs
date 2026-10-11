import { IsBoolean } from 'class-validator';

export class UpdatePatientNotificationPreferenceDto {
  @IsBoolean()
  whatsappTransactionalEnabled!: boolean;
}
