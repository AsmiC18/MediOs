import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReplaceRolePermissionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionNames!: string[];
}
