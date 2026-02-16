import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveArtifactDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

