import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { NoticeService, CreateNoticeDto, UpdateNoticeDto } from './notice.service';

@Controller('notices')
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  /**
   * 공지사항 생성
   * POST /notices
   */
  @Post()
  async create(@Body() dto: CreateNoticeDto) {
    return this.noticeService.create(dto);
  }

  /**
   * 공지사항 목록 조회
   * GET /notices?limit=20&offset=0
   */
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

  /**
   * 공지사항 상세 조회
   * GET /notices/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.noticeService.findOne(id);
  }

  /**
   * 공지사항 수정
   * PATCH /notices/:id
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateNoticeDto) {
    return this.noticeService.update(id, dto);
  }

  /**
   * 공지사항 삭제
   * DELETE /notices/:id
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.noticeService.remove(id);
  }
}
