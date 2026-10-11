import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompletePreOpChecklistItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
