import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KanbanCardStatus } from '@prisma/client';
import {
  CreateCardDto,
  CreateColumnDto,
  MoveCardDto,
  RenameColumnDto,
  UpdateCardDto,
} from './dto';

@Injectable()
export class KanbanService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- helpers ----------
  private async assertProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
    if (!project) throw new NotFoundException('프로젝트가 없어요.');
    return project;
  }

  private mapStatusByColumnTitle(title: string): KanbanCardStatus {
    const t = title.trim().toUpperCase();
    if (t === 'TODO') return KanbanCardStatus.TODO;
    if (t === 'IN PROGRESS' || t === 'IN_PROGRESS')
      return KanbanCardStatus.IN_PROGRESS;
    if (t === 'DONE') return KanbanCardStatus.DONE;
    // 기본은 TODO
    return KanbanCardStatus.TODO;
  }

  private async getBoardRaw(projectId: string) {
    return this.prisma.kanbanBoard.findUnique({
      where: { projectId },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: {
            cards: {
              orderBy: { position: 'asc' },
              include: {
                assignees: {
                  include: { user: { select: { id: true, nickname: true } } },
                },
              },
            },
          },
        },
      },
    });
  }

  async getBoard(projectId: string) {
    await this.assertProject(projectId);

    const board = await this.getBoardRaw(projectId);
    if (!board) return null;

    return {
      id: board.id,
      projectId: board.projectId,
      columns: board.columns.map(c => ({
        id: c.id,
        title: c.title,
        position: c.position,
        cards: c.cards.map(card => ({
          id: card.id,
          title: card.title,
          description: card.description,
          status: card.status,
          dueDate: card.dueDate,
          position: card.position,
          assignees: card.assignees.map(a => ({
            userId: a.userId,
            nickname: a.user?.nickname ?? null,
          })),
        })),
      })),
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    };
  }

  /**
   * 없으면 기본 보드 생성 (TODO / IN PROGRESS / DONE)
   * ownerId 들어오면 ProjectMember도 보장
   */
  async ensureBoard(projectId: string, ownerId: string | null) {
    const project = await this.assertProject(projectId);

    const existing = await this.prisma.kanbanBoard.findUnique({
      where: { projectId },
    });
    if (existing) return this.getBoard(projectId);

    const finalOwnerId = ownerId ?? project.ownerId;

    await this.prisma.$transaction(async tx => {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: finalOwnerId } },
        create: { projectId, userId: finalOwnerId, roleInProject: 'OWNER' },
        update: {},
      });

      const board = await tx.kanbanBoard.create({
        data: { projectId },
        select: { id: true },
      });

      await tx.kanbanColumn.createMany({
        data: [
          { boardId: board.id, title: 'TODO', position: 0 },
          { boardId: board.id, title: 'IN PROGRESS', position: 1 },
          { boardId: board.id, title: 'DONE', position: 2 },
        ],
      });
    });

    return this.getBoard(projectId);
  }

  // ---------- Columns ----------
  async createColumn(projectId: string, dto: CreateColumnDto) {
    await this.assertProject(projectId);

    const board = await this.prisma.kanbanBoard.findUnique({
      where: { projectId },
      include: { columns: true },
    });
    if (!board)
      throw new BadRequestException('보드가 없어요. 먼저 init 해주세요.');

    const nextPos =
      board.columns.length === 0
        ? 0
        : Math.max(...board.columns.map(c => c.position)) + 1;

    await this.prisma.kanbanColumn.create({
      data: {
        boardId: board.id,
        title: dto.title,
        position: nextPos,
      },
    });

    return this.getBoard(projectId);
  }

  async renameColumn(
    projectId: string,
    columnId: string,
    dto: RenameColumnDto,
  ) {
    await this.assertProject(projectId);

    const col = await this.prisma.kanbanColumn.findUnique({
      where: { id: columnId },
      select: { id: true, board: { select: { projectId: true } } },
    });
    if (!col || col.board.projectId !== projectId)
      throw new NotFoundException('컬럼을 찾을 수 없어요.');

    await this.prisma.kanbanColumn.update({
      where: { id: columnId },
      data: { title: dto.title },
    });

    // 컬럼명 바뀌면 status 매핑도 바꾸고 싶으면 여기서 카드 status 일괄 업데이트 가능 (선택)
    return this.getBoard(projectId);
  }

  async deleteColumn(projectId: string, columnId: string) {
    await this.assertProject(projectId);

    const col = await this.prisma.kanbanColumn.findUnique({
      where: { id: columnId },
      select: { id: true, board: { select: { projectId: true } } },
    });
    if (!col || col.board.projectId !== projectId)
      throw new NotFoundException('컬럼을 찾을 수 없어요.');

    // onDelete: Cascade라 카드도 같이 삭제됨
    await this.prisma.kanbanColumn.delete({ where: { id: columnId } });

    return this.getBoard(projectId);
  }

  // ---------- Cards ----------
  async createCard(projectId: string, dto: CreateCardDto) {
    await this.assertProject(projectId);

    const col = await this.prisma.kanbanColumn.findUnique({
      where: { id: dto.columnId },
      include: { board: true, cards: true },
    });
    if (!col || col.board.projectId !== projectId)
      throw new NotFoundException('컬럼을 찾을 수 없어요.');

    const nextPos =
      col.cards.length === 0
        ? 0
        : Math.max(...col.cards.map(c => c.position)) + 1;

    const status = this.mapStatusByColumnTitle(col.title);

    await this.prisma.kanbanCard.create({
      data: {
        columnId: dto.columnId,
        title: dto.title,
        description: dto.description ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        position: nextPos,
        status,
      },
    });

    return this.getBoard(projectId);
  }

  async updateCard(projectId: string, cardId: string, dto: UpdateCardDto) {
    await this.assertProject(projectId);

    const card = await this.prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: { column: { include: { board: true } } },
    });
    if (!card || card.column.board.projectId !== projectId)
      throw new NotFoundException('카드를 찾을 수 없어요.');

    await this.prisma.kanbanCard.update({
      where: { id: cardId },
      data: {
        title: dto.title ?? undefined,
        description: dto.description ?? undefined,
        dueDate:
          dto.dueDate === null
            ? null
            : dto.dueDate
              ? new Date(dto.dueDate)
              : undefined,
      },
    });

    return this.getBoard(projectId);
  }

  async deleteCard(projectId: string, cardId: string) {
    await this.assertProject(projectId);

    const card = await this.prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: { column: { include: { board: true } } },
    });
    if (!card || card.column.board.projectId !== projectId)
      throw new NotFoundException('카드를 찾을 수 없어요.');

    await this.prisma.kanbanCard.delete({ where: { id: cardId } });

    // position 정렬까지 깔끔히 하려면 같은 컬럼 카드들 reindex(선택)
    return this.getBoard(projectId);
  }

  /**
   * 카드 이동: fromColumn -> toColumn + toPosition 삽입
   * 규칙:
   * - fromColumn의 카드들 position 재정렬
   * - toColumn의 카드들 position 재정렬
   * - status는 목적 컬럼명 기준으로 업데이트(추천)
   */
  async moveCard(projectId: string, dto: MoveCardDto) {
    await this.assertProject(projectId);

    const card = await this.prisma.kanbanCard.findUnique({
      where: { id: dto.cardId },
      include: {
        column: { include: { board: true } },
      },
    });
    if (!card || card.column.board.projectId !== projectId)
      throw new NotFoundException('카드를 찾을 수 없어요.');

    // 컬럼 검증
    const fromCol = await this.prisma.kanbanColumn.findUnique({
      where: { id: dto.fromColumnId },
      include: { board: true, cards: { orderBy: { position: 'asc' } } },
    });
    const toCol = await this.prisma.kanbanColumn.findUnique({
      where: { id: dto.toColumnId },
      include: { board: true, cards: { orderBy: { position: 'asc' } } },
    });

    if (!fromCol || fromCol.board.projectId !== projectId)
      throw new NotFoundException('fromColumn이 없어요.');
    if (!toCol || toCol.board.projectId !== projectId)
      throw new NotFoundException('toColumn이 없어요.');

    if (card.columnId !== dto.fromColumnId) {
      // 프론트/상태 불일치 방지
      throw new BadRequestException(
        'fromColumnId가 카드의 현재 컬럼과 달라요.',
      );
    }

    // 같은 컬럼 내 이동 vs 컬럼 변경
    const sameColumn = dto.fromColumnId === dto.toColumnId;

    await this.prisma.$transaction(async tx => {
      if (sameColumn) {
        // same column reorder
        const list = fromCol.cards.filter(c => c.id !== dto.cardId);
        const targetIndex = Math.min(Math.max(dto.toPosition, 0), list.length);
        list.splice(targetIndex, 0, { ...card, position: -1 } as any);

        // positions update
        for (let i = 0; i < list.length; i++) {
          await tx.kanbanCard.update({
            where: { id: list[i].id },
            data: { position: i },
          });
        }
      } else {
        // remove from fromCol
        const fromList = fromCol.cards.filter(c => c.id !== dto.cardId);
        for (let i = 0; i < fromList.length; i++) {
          await tx.kanbanCard.update({
            where: { id: fromList[i].id },
            data: { position: i },
          });
        }

        // insert into toCol
        const toList = [...toCol.cards];
        const targetIndex = Math.min(
          Math.max(dto.toPosition, 0),
          toList.length,
        );

        // 먼저 card를 toColumn으로 옮겨둠 (임시 position)
        const newStatus = this.mapStatusByColumnTitle(toCol.title);

        await tx.kanbanCard.update({
          where: { id: dto.cardId },
          data: {
            columnId: dto.toColumnId,
            status: newStatus,
            position: 999999, // 임시
          },
        });

        // 그리고 배열에 끼워넣고 position 재배치
        const merged = [
          ...toList.slice(0, targetIndex),
          { id: dto.cardId } as any,
          ...toList.slice(targetIndex),
        ];

        for (let i = 0; i < merged.length; i++) {
          await tx.kanbanCard.update({
            where: { id: merged[i].id },
            data: { position: i },
          });
        }
      }
    });

    return this.getBoard(projectId);
  }
}
