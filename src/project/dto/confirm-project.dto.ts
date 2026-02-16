import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

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
}
