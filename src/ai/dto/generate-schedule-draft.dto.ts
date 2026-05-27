import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AiLanguage, OpenAiBundleModel } from './generate-project.dto';

export class GenerateScheduleDraftDto {
  @IsOptional()
  @IsEnum(AiLanguage)
  language?: AiLanguage;

  /** 미지정 시 서버 `OPENAI_MODEL` 또는 gpt-4.1-mini */
  @IsOptional()
  @IsEnum(OpenAiBundleModel)
  openAiModel?: OpenAiBundleModel;

  /** 모델에 추가로 전달할 메모(범위·우선 작업 등) */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalNotes?: string;

  /** 생성할 이벤트 개수 상한(프롬프트·검증에 사용) */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(30)
  maxEvents?: number;
}
