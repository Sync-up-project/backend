import { IsObject } from 'class-validator';

export class UpdateArtifactContentDto {
  @IsObject()
  contentJson!: Record<string, unknown>;
}
