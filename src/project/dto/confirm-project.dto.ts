import { IsArray, IsDateString, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

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
}
