import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { KanbanService } from './kanban.service';
import {
  CreateCardDto,
  CreateColumnDto,
  MoveCardDto,
  RenameColumnDto,
  UpdateCardDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('projects/:projectId/kanban')
@UseGuards(JwtAuthGuard)
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Get()
  async getBoard(
    @Param('projectId') projectId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.kanbanService.getBoard(projectId, String(user.id));
  }

  @Post('init')
  async initBoard(
    @Param('projectId') projectId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.kanbanService.ensureBoard(projectId, String(user.id));
  }

  @Post('columns')
  async createColumn(
    @Param('projectId') projectId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateColumnDto,
  ) {
    return this.kanbanService.createColumn(projectId, String(user.id), dto);
  }

  @Patch('columns/:columnId')
  async renameColumn(
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RenameColumnDto,
  ) {
    return this.kanbanService.renameColumn(
      projectId,
      String(user.id),
      columnId,
      dto,
    );
  }

  @Delete('columns/:columnId')
  async deleteColumn(
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.kanbanService.deleteColumn(projectId, String(user.id), columnId);
  }

  @Post('cards')
  async createCard(
    @Param('projectId') projectId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCardDto,
  ) {
    return this.kanbanService.createCard(projectId, String(user.id), dto);
  }

  @Patch('cards/:cardId')
  async updateCard(
    @Param('projectId') projectId: string,
    @Param('cardId') cardId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCardDto,
  ) {
    return this.kanbanService.updateCard(
      projectId,
      String(user.id),
      cardId,
      dto,
    );
  }

  @Delete('cards/:cardId')
  async deleteCard(
    @Param('projectId') projectId: string,
    @Param('cardId') cardId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.kanbanService.deleteCard(projectId, String(user.id), cardId);
  }

  @Post('cards/move')
  async moveCard(
    @Param('projectId') projectId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: MoveCardDto,
  ) {
    return this.kanbanService.moveCard(projectId, String(user.id), dto);
  }
}
