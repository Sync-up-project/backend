import { Injectable } from '@nestjs/common';
import { Language } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatMessageDto } from '../domain/chat/chat.types';
import { mapDbMessageToDto } from '../domain/chat/chat-message.mapper';
import { AppLogger } from '../common/logger/app-logger.service';

const MESSAGE_INCLUDE = {
  sender: { select: { nickname: true } },
  i18n: { select: { targetLang: true, translatedText: true } },
} as const;

@Injectable()
export class ChatRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(ChatRepository.name);
  }

  async ensureProjectRoom(projectId: string): Promise<string | null> {
    try {
      const room = await this.prisma.chatRoom.upsert({
        where: { projectId },
        create: { type: 'PROJECT_GROUP', projectId },
        update: {},
      });
      return room.id;
    } catch (err) {
      this.logger.error(
        'Failed to ensure project room',
        err instanceof Error ? err.stack : undefined,
        { projectId },
      );
      return null;
    }
  }

  async findUserNickname(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true },
    });
    return user?.nickname ?? null;
  }

  async findUserPrimaryLanguage(userId: string): Promise<Language> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { primaryLanguage: true },
    });
    return user?.primaryLanguage ?? Language.KO;
  }

  async loadLatestMessages(
    roomId: string,
    limit: number,
  ): Promise<{ messages: ChatMessageDto[]; hasMore: boolean }> {
    return this.loadPage(roomId, limit, {});
  }

  async loadOlderMessages(
    roomId: string,
    before: Date,
    limit: number,
  ): Promise<{ messages: ChatMessageDto[]; hasMore: boolean }> {
    return this.loadPage(roomId, limit, { before });
  }

  private async loadPage(
    roomId: string,
    limit: number,
    opts: { before?: Date },
  ): Promise<{ messages: ChatMessageDto[]; hasMore: boolean }> {
    try {
      const where =
        opts.before != null
          ? { roomId, createdAt: { lt: opts.before } }
          : { roomId };

      const dbMessages = await this.prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include: MESSAGE_INCLUDE,
      });

      const hasMore = dbMessages.length > limit;
      const slice = hasMore ? dbMessages.slice(0, limit) : dbMessages;
      const chronological = [...slice].reverse();

      return {
        messages: chronological.map((msg) => mapDbMessageToDto(msg)),
        hasMore,
      };
    } catch (err) {
      this.logger.error(
        'Failed to load chat messages',
        err instanceof Error ? err.stack : undefined,
        { roomId },
      );
      return { messages: [], hasMore: false };
    }
  }

  async createMessage(params: {
    roomId: string;
    senderId: string;
    text: string;
    originalLang: Language;
    translations: Partial<Record<Language, string>>;
  }): Promise<ChatMessageDto | null> {
    try {
      const translationEntries = Object.entries(params.translations).filter(
        ([, text]) => typeof text === 'string' && text.trim().length > 0,
      );

      const dbMessage = await this.prisma.$transaction(async (tx) => {
        const created = await tx.chatMessage.create({
          data: {
            roomId: params.roomId,
            senderId: params.senderId,
            originalText: params.text,
            originalLang: params.originalLang,
          },
          include: MESSAGE_INCLUDE,
        });

        if (translationEntries.length > 0) {
          await tx.chatMessageI18n.createMany({
            data: translationEntries.map(([targetLang, translatedText]) => ({
              messageId: created.id,
              targetLang: targetLang as Language,
              translatedText,
            })),
          });
        }

        if (translationEntries.length > 0) {
          return tx.chatMessage.findUniqueOrThrow({
            where: { id: created.id },
            include: MESSAGE_INCLUDE,
          });
        }

        return created;
      });

      return mapDbMessageToDto(dbMessage);
    } catch (err) {
      this.logger.error(
        'Failed to create chat message',
        err instanceof Error ? err.stack : undefined,
      );
      return null;
    }
  }
}
