import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateCalendarEventDto } from './create-calendar-event.dto';

export class BulkCreateCalendarEventsDto {
  @ValidateNested({ each: true })
  @Type(() => CreateCalendarEventDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  events!: CreateCalendarEventDto[];
}
