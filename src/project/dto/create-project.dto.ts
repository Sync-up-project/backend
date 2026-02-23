// src/project/dto/create-project.dto.ts
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ProjectModeDto {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

export enum ProjectDifficultyDto {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

export class PositionNeedDto {
  @IsString()
  position!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  headcount?: number;
}

export class CreateProjectDto {
  /**
   * ⚠️ 지금은 인증 연동 전이므로 임시로 ownerId를 body로 받습니다.
   * 나중에 로그인 붙이면 CurrentUser에서 userId로 대체하는 게 정석입니다.
   */
  @IsString()
  ownerId!: string;

  @IsOptional()
  @IsString()
  originalLang?: string; // KO/JA/EN 등 (스키마에 맞게)

  @IsString()
  titleOriginal!: string;

  @IsOptional()
  @IsString()
  summaryOriginal?: string;

  @IsOptional()
  @IsString()
  descriptionOriginal?: string;

  @IsOptional()
  @IsEnum(ProjectModeDto)
  mode?: ProjectModeDto;

  @IsOptional()
  @IsEnum(ProjectDifficultyDto)
  difficulty?: ProjectDifficultyDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  /**
   * techStacks는 ["React","NestJS"] 또는 [{name:"React"}] 형태가 프론트에서 올 수 있어서
   * 여기서는 string[]로 “정규화”해서 받는 걸 추천합니다.
   */
  @IsOptional()
  @IsArray()
  techStacks?: Array<string>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PositionNeedDto)
  positionNeeds?: PositionNeedDto[];
}
