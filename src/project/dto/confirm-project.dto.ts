import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum ProjectModeDto {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

export enum ProjectDifficultyDto {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

export class ConfirmProjectDto {
  @IsString()
  artifactId!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(ProjectModeDto)
  mode?: ProjectModeDto;

  @IsOptional()
  @IsEnum(ProjectDifficultyDto)
  difficulty?: ProjectDifficultyDto;

  @IsOptional()
  @IsObject()
  decisions?: Record<string, any>;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  originalLang?: string;

  @IsOptional()
  @IsString()
  summaryOriginal?: string;

  @IsOptional()
  @IsString()
  descriptionOriginal?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  techStacks?: string[];

  @IsOptional()
  @IsArray()
  collaborationTools?: string[];

  /** 프로젝트 모집 정원 (미입력 시 서버 기본 1) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  capacity?: number;
}
