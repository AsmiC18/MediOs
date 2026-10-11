import { IsUUID } from 'class-validator';

export class AssignHospitalPlanDto {
  @IsUUID()
  planId!: string;
}
