import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Language } from '@prisma/client';

export interface CreateNoticeDto {
  authorId: string;
  titleOriginal: string;
  contentOriginal: string;
  originalLang?: Language;
  pinned?: boolean;
}

export interface UpdateNoticeDto {
  titleOriginal?: string;
  contentOriginal?: string;
  pinned?: boolean;
}

@Injectable()
export class NoticeService {
  constructor(private prisma: PrismaService) {}

  /**
   * 공지사항 생성
   */
  async create(dto: CreateNoticeDto) {
    if (!dto.authorId) throw new BadRequestException('authorId가 필요합니다.');
    if (!dto.titleOriginal?.trim()) throw new BadRequestException('titleOriginal이 필요합니다.');
    if (!dto.contentOriginal?.trim()) throw new BadRequestException('contentOriginal이 필요합니다.');

    const notice = await this.prisma.notice.create({
      data: {
        authorId: dto.authorId,
        originalLang: dto.originalLang || Language.KO,
        titleOriginal: dto.titleOriginal.trim(),
        contentOriginal: dto.contentOriginal.trim(),
        pinned: dto.pinned || false,
        i18n: {
          create: {
            lang: dto.originalLang || Language.KO,
            title: dto.titleOriginal.trim(),
            content: dto.contentOriginal.trim(),
          },
        },
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            email: true,
          },
        },
        i18n: true,
      },
    });

    return notice;
  }

  /**
   * 공지사항 목록 조회
   */
  async findAll(limit: number = 20, offset: number = 0) {
    const [notices, total] = await Promise.all([
      this.prisma.notice.findMany({
        take: limit,
        skip: offset,
        orderBy: [
          { pinned: 'desc' },
          { createdAt: 'desc' },
        ],
        select: {
          id: true,
          pinned: true,
          titleOriginal: true,
          originalLang: true,
          viewCount: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              nickname: true,
            },
          },
          i18n: {
            select: {
              lang: true,
              title: true,
            },
          },
        },
      }),
      this.prisma.notice.count(),
    ]);

    // 필요한 필드만 매핑
    const mappedNotices = notices.map((notice) => ({
      id: notice.id,
      pinned: notice.pinned,
      title: notice.titleOriginal,
      authorNickname: notice.author.nickname,
      createdAt: notice.createdAt,
      viewCount: notice.viewCount,
      i18n: notice.i18n, // 프론트에서 언어별 제목 선택용
    }));

    return {
      notices: mappedNotices,
      total,
      limit,
      offset,
    };
  }

  /**
   * 공지사항 상세 조회
   */
  async findOne(id: string) {
    const notice = await this.prisma.notice.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            email: true,
          },
        },
        i18n: true,
      },
    });

    if (!notice) {
      throw new NotFoundException('공지사항을 찾을 수 없습니다.');
    }

    // 조회수 증가
    await this.prisma.notice.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return {
      ...notice,
      viewCount: notice.viewCount + 1,
    };
  }

  /**
   * 공지사항 수정
   */
  async update(id: string, dto: UpdateNoticeDto) {
    const notice = await this.prisma.notice.findUnique({
      where: { id },
    });

    if (!notice) {
      throw new NotFoundException('공지사항을 찾을 수 없습니다.');
    }

    const updateData: any = {};
    if (dto.titleOriginal !== undefined) updateData.titleOriginal = dto.titleOriginal.trim();
    if (dto.contentOriginal !== undefined) updateData.contentOriginal = dto.contentOriginal.trim();
    if (dto.pinned !== undefined) updateData.pinned = dto.pinned;

    const updated = await this.prisma.notice.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            email: true,
          },
        },
        i18n: true,
      },
    });

    // i18n도 업데이트 (원본 언어만)
    if (dto.titleOriginal || dto.contentOriginal) {
      await this.prisma.noticeI18n.upsert({
        where: {
          noticeId_lang: {
            noticeId: id,
            lang: notice.originalLang,
          },
        },
        create: {
          noticeId: id,
          lang: notice.originalLang,
          title: dto.titleOriginal?.trim() || notice.titleOriginal,
          content: dto.contentOriginal?.trim() || notice.contentOriginal,
        },
        update: {
          title: dto.titleOriginal?.trim() || undefined,
          content: dto.contentOriginal?.trim() || undefined,
        },
      });
    }

    return updated;
  }

  /**
   * 공지사항 삭제
   */
  async remove(id: string) {
    const notice = await this.prisma.notice.findUnique({
      where: { id },
    });

    if (!notice) {
      throw new NotFoundException('공지사항을 찾을 수 없습니다.');
    }

    await this.prisma.notice.delete({
      where: { id },
    });

    return { message: '공지사항이 삭제되었습니다.' };
  }
}
