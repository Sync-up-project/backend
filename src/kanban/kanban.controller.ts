import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
} from '@nestjs/common';
import { KanbanService } from './kanban.service';
import {
  CreateCardDto,
  CreateColumnDto,
  MoveCardDto,
  RenameColumnDto,
  UpdateCardDto,
} from './dto';

@Controller('projects/:projectId/kanban')
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Get()
  async getBoard(@Param('projectId') projectId: string) {
    return this.kanbanService.getBoard(projectId);
  }

  // Confirm 시 자동 생성/보장
  @Post('init')
  async initBoard(
    @Param('projectId') projectId: string,
    @Body() body: { ownerId?: string },
  ) {
    return this.kanbanService.ensureBoard(projectId, body?.ownerId ?? null);
  }

  // ---- Columns ----
  @Post('columns')
  async createColumn(
    @Param('projectId') projectId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.kanbanService.createColumn(projectId, dto);
  }

  @Patch('columns/:columnId')
  async renameColumn(
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @Body() dto: RenameColumnDto,
  ) {
    return this.kanbanService.renameColumn(projectId, columnId, dto);
  }

  @Delete('columns/:columnId')
  async deleteColumn(
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
  ) {
    return this.kanbanService.deleteColumn(projectId, columnId);
  }

  // ---- Cards ----
  @Post('cards')
  async createCard(
    @Param('projectId') projectId: string,
    @Body() dto: CreateCardDto,
  ) {
    return this.kanbanService.createCard(projectId, dto);
  }

  @Patch('cards/:cardId')
  async updateCard(
    @Param('projectId') projectId: string,
    @Param('cardId') cardId: string,
    @Body() dto: UpdateCardDto,
  ) {
    return this.kanbanService.updateCard(projectId, cardId, dto);
  }

  @Delete('cards/:cardId')
  async deleteCard(
    @Param('projectId') projectId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.kanbanService.deleteCard(projectId, cardId);
  }

  // 카드 이동(드래그앤드롭 핵심)
  @Post('cards/move')
  async moveCard(
    @Param('projectId') projectId: string,
    @Body() dto: MoveCardDto,
  ) {
    return this.kanbanService.moveCard(projectId, dto);
  }
}
