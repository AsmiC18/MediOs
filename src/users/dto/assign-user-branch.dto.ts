import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class AssignUserBranchDto {
  /** Set to null for hospital-wide scope. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  branchId?: string | null;
}
