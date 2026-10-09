import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}
export class SendText {
  @IsString() @MinLength(1) @MaxLength(4096) text!: string;
}
export class UpdateConversation {
  @IsOptional() @IsIn(['open', 'resolved']) status?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1) unreadCount?: number;
}
