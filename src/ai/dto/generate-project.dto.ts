import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';

export enum AiLanguage {
  KO = 'KO',
  EN = 'EN',
  JA = 'JA',
}

export enum GenerateMode {
  DRAFT = 'DRAFT',
}

export enum MockPreset {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

export class GenerateProjectDto {
  @IsString()
  @MaxLength(20000)
  ideaText!: string;

  @IsOptional()
  @IsEnum(AiLanguage)
  language?: AiLanguage;

  @IsOptional()
  @IsEnum(GenerateMode)
  mode?: GenerateMode;

  @IsOptional()
  @IsEnum(MockPreset)
  mockPreset?: MockPreset;
}
