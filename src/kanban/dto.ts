import {
  IsInt,
  IsOptional,
  IsString,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateColumnDto {
  @IsString()
  title!: string;
}

export class RenameColumnDto {
  @IsString()
  title!: string;
}

export class ReorderColumnsDto {
  // columns: [{ columnId, position }]
  columns!: { columnId: string; position: number }[];
}

export class CreateCardDto {
  @IsString()
  columnId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateCardDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}

export class MoveCardDto {
  @IsString()
  cardId!: string;

  @IsString()
  fromColumnId!: string;

  @IsString()
  toColumnId!: string;

  @IsInt()
  @Min(0)
  toPosition!: number; // 목적 컬럼에서 들어갈 index

  @IsOptional()
  @IsInt()
  @Min(0)
  fromPosition?: number; // 있으면 검증용으로 쓸 수 있음(선택)
}
