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

/** OpenAI Responses API에 넘길 번들 생성 모델 (화이트리스트) */
export enum OpenAiBundleModel {
  GPT_41_MINI = 'gpt-4.1-mini',
  GPT_41 = 'gpt-4.1',
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

  /** 미지정 시 서버 `OPENAI_MODEL` 또는 gpt-4.1-mini */
  @IsOptional()
  @IsEnum(OpenAiBundleModel)
  openAiModel?: OpenAiBundleModel;

  @IsOptional()
  @IsString()
  createdById?: string;
}
