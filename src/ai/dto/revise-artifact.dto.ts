import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { AiLanguage } from './generate-project.dto';

export class ReviseArtifactDto {
  @IsString()
  @MaxLength(2000)
  instruction!: string;

  @IsOptional()
  @IsEnum(AiLanguage)
  language?: AiLanguage;
}

