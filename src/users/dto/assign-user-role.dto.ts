import { IsUUID } from 'class-validator';

export class AssignUserRoleDto {
  @IsUUID()
  roleId!: string;
}
