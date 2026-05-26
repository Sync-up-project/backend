import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const CALENDAR_EVENT_TYPES = ['TASK', 'MEETING', 'MILESTONE'] as const;
const CALENDAR_EVENT_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'DONE',
  'BLOCKED',
  // legacy 호환
  'PLANNED',
  'COMPLETED',
  'FINISHED',
] as const;
const CALENDAR_EVENT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(CALENDAR_EVENT_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(CALENDAR_EVENT_TYPES as unknown as string[])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn(CALENDAR_EVENT_PRIORITIES as unknown as string[])
  priority?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  memo?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}
