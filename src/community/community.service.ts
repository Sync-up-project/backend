import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Language, PostCategory } from '@prisma/client';

export interface CreatePostDto {
  authorId: string;
  category: PostCategory;
  titleOriginal: string;
  contentOriginal: string;
  originalLang?: Language;
  tags?: string[];
}

export interface UpdatePostDto {
  titleOriginal?: string;
  contentOriginal?: string;
  category?: PostCategory;
  tags?: string[];
}

export interface CreateCommentDto {
  postId: string;
  authorId: string;
  contentOriginal: string;
  originalLang?: Language;
  parentCommentId?: string;
}

@Injectable()
export class CommunityService {
  constructor(private prisma: PrismaService) {}

  async createPost(dto: CreatePostDto) {
    if (!dto.authorId) throw new BadRequestException('authorId가 필요합니다.');
    if (!dto.titleOriginal?.trim()) throw new BadRequestException('titleOriginal이 필요합니다.');
    if (!dto.contentOriginal?.trim()) throw new BadRequestException('contentOriginal이 필요합니다.');

    const post = await this.prisma.communityPost.create({
      data: {
        authorId: dto.authorId,
        category: dto.category || PostCategory.FREE,
        originalLang: dto.originalLang || Language.KO,
        titleOriginal: dto.titleOriginal.trim(),
        contentOriginal: dto.contentOriginal.trim(),
        tags: dto.tags || [],
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
        _count: {
          select: {
            comments: true,
            likes: true,
          },
        },
      },
    });

    return post;
  }

  async findAllPosts(
    category?: PostCategory,
    limit: number = 20,
    offset: number = 0,
    sortBy: 'latest' | 'popular' | 'commented' = 'latest',
  ) {
    const where: any = {};
    if (category) {
      where.category = category;
    }

    const orderBy: any[] = [];
    if (sortBy === 'popular') {
      orderBy.push({ likeCount: 'desc' });
    } else if (sortBy === 'commented') {
      orderBy.push({ commentCount: 'desc' });
    }
    orderBy.push({ createdAt: 'desc' });

    const [posts, total] = await Promise.all([
      this.prisma.communityPost.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy,
        select: {
          id: true,
          category: true,
          titleOriginal: true,
          originalLang: true,
          likeCount: true,
          commentCount: true,
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
      this.prisma.communityPost.count({ where }),
    ]);

    const mappedPosts = posts.map((post) => ({
      id: post.id,
      category: post.category,
      title: post.titleOriginal,
      authorNickname: post.author.nickname,
      createdAt: post.createdAt,
      commentCount: post.commentCount,
      likeCount: post.likeCount,
      viewCount: post.viewCount,
      i18n: post.i18n,
    }));

    return {
      posts: mappedPosts,
      total,
      limit,
      offset,
    };
  }

  async findOnePost(id: string) {
    const post = await this.prisma.communityPost.findUnique({
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
        comments: {
          include: {
            author: {
              select: {
                id: true,
                nickname: true,
                email: true,
              },
            },
            i18n: true,
            replies: {
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
            },
            _count: {
              select: {
                likes: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        _count: {
          select: {
            comments: true,
            likes: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    await this.prisma.communityPost.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return {
      ...post,
      viewCount: post.viewCount + 1,
    };
  }

  async updatePost(id: string, dto: UpdatePostDto) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    const updateData: any = {};
    if (dto.titleOriginal !== undefined) updateData.titleOriginal = dto.titleOriginal.trim();
    if (dto.contentOriginal !== undefined) updateData.contentOriginal = dto.contentOriginal.trim();
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.tags !== undefined) updateData.tags = dto.tags;

    const updated = await this.prisma.communityPost.update({
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
        _count: {
          select: {
            comments: true,
            likes: true,
          },
        },
      },
    });

    if (dto.titleOriginal || dto.contentOriginal) {
      await this.prisma.postI18n.upsert({
        where: {
          postId_lang: {
            postId: id,
            lang: post.originalLang,
          },
        },
        create: {
          postId: id,
          lang: post.originalLang,
          title: dto.titleOriginal?.trim() || post.titleOriginal,
          content: dto.contentOriginal?.trim() || post.contentOriginal,
        },
        update: {
          title: dto.titleOriginal?.trim() || undefined,
          content: dto.contentOriginal?.trim() || undefined,
        },
      });
    }

    return updated;
  }

  async removePost(id: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    await this.prisma.communityPost.delete({
      where: { id },
    });

    return { message: '게시글이 삭제되었습니다.' };
  }

  async createComment(dto: CreateCommentDto) {
    if (!dto.postId) throw new BadRequestException('postId가 필요합니다.');
    if (!dto.authorId) throw new BadRequestException('authorId가 필요합니다.');
    if (!dto.contentOriginal?.trim()) throw new BadRequestException('contentOriginal이 필요합니다.');

    const post = await this.prisma.communityPost.findUnique({
      where: { id: dto.postId },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    const comment = await this.prisma.postComment.create({
      data: {
        postId: dto.postId,
        authorId: dto.authorId,
        originalLang: dto.originalLang || Language.KO,
        contentOriginal: dto.contentOriginal.trim(),
        parentCommentId: dto.parentCommentId || null,
        i18n: {
          create: {
            lang: dto.originalLang || Language.KO,
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

    await this.prisma.communityPost.update({
      where: { id: dto.postId },
      data: { commentCount: { increment: 1 } },
    });

    return comment;
  }

  async removeComment(id: string) {
    const comment = await this.prisma.postComment.findUnique({
      where: { id },
      include: {
        post: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    await this.prisma.postComment.delete({
      where: { id },
    });

    await this.prisma.communityPost.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    });

    return { message: '댓글이 삭제되었습니다.' };
  }

  async togglePostLike(postId: string, userId: string) {
    const existing = await this.prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    if (existing) {
      await this.prisma.postLike.delete({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
      });

      await this.prisma.communityPost.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      });

      return { liked: false };
    } else {
      await this.prisma.postLike.create({
        data: {
          postId,
          userId,
        },
      });

      await this.prisma.communityPost.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      });

      return { liked: true };
    }
  }
}
