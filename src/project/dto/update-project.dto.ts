import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePositionNeedDto {
  @IsString()
  position!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  headcount?: number;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  titleOriginal?: string;

  @IsOptional()
  @IsString()
  summaryOriginal?: string;

  @IsOptional()
  @IsString()
  descriptionOriginal?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  techStacks?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePositionNeedDto)
  positionNeeds?: UpdatePositionNeedDto[];
}
