import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { NoticeService, CreateNoticeDto, UpdateNoticeDto } from './notice.service';

@Controller('notices')
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  @Post()
  async create(@Body() dto: CreateNoticeDto) {
    return this.noticeService.create(dto);
  }

  @Get()
  async findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.noticeService.findAll(
      limit ? Number(limit) : 20,
      offset ? Number(offset) : 0,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.noticeService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateNoticeDto) {
    return this.noticeService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.noticeService.remove(id);
  }
}
