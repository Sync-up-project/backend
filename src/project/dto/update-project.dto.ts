import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

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
}
