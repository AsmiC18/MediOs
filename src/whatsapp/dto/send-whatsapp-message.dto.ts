import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SendWhatsAppMessageDto {
  @IsIn(['text', 'template'])
  type!: 'text' | 'template';

  @ValidateIf((dto: SendWhatsAppMessageDto) => dto.type === 'text')
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text?: string;

  @ValidateIf((dto: SendWhatsAppMessageDto) => dto.type === 'template')
  @IsString()
  @MinLength(1)
  templateName?: string;

  @ValidateIf((dto: SendWhatsAppMessageDto) => dto.type === 'template')
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  languageCode?: string;

  @ValidateIf((dto: SendWhatsAppMessageDto) => dto.type === 'template')
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  parameters?: string[];
}
