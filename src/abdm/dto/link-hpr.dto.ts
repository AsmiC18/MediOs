import { IsString } from 'class-validator';

export class LinkHprDto {
  @IsString()
  hprId: string;
}
