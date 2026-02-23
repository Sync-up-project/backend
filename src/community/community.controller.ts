import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CommunityService, CreatePostDto, UpdatePostDto, CreateCommentDto } from './community.service';
import { PostCategory } from '@prisma/client';

@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  /**
   * 게시글 생성
   * POST /community/posts
   */
  @Post('posts')
  async createPost(@Body() dto: CreatePostDto) {
    return this.communityService.createPost(dto);
  }

  /**
   * 게시글 목록 조회
   * GET /community/posts?category=FREE&limit=20&offset=0&sortBy=latest
   */
  @Get('posts')
  async findAllPosts(
    @Query('category') category?: PostCategory,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sortBy') sortBy?: 'latest' | 'popular' | 'commented',
  ) {
    return this.communityService.findAllPosts(
      category,
      limit ? Number(limit) : 20,
      offset ? Number(offset) : 0,
      sortBy || 'latest',
    );
  }

  /**
   * 게시글 상세 조회
   * GET /community/posts/:id
   */
  @Get('posts/:id')
  async findOnePost(@Param('id') id: string) {
    return this.communityService.findOnePost(id);
  }

  /**
   * 게시글 수정
   * PATCH /community/posts/:id
   */
  @Patch('posts/:id')
  async updatePost(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.communityService.updatePost(id, dto);
  }

  /**
   * 게시글 삭제
   * DELETE /community/posts/:id
   */
  @Delete('posts/:id')
  async removePost(@Param('id') id: string) {
    return this.communityService.removePost(id);
  }

  /**
   * 댓글 생성
   * POST /community/posts/:postId/comments
   */
  @Post('posts/:postId/comments')
  async createComment(
    @Param('postId') postId: string,
    @Body() dto: Omit<CreateCommentDto, 'postId'>,
  ) {
    return this.communityService.createComment({
      ...dto,
      postId,
    });
  }

  /**
   * 댓글 삭제
   * DELETE /community/comments/:id
   */
  @Delete('comments/:id')
  async removeComment(@Param('id') id: string) {
    return this.communityService.removeComment(id);
  }

  /**
   * 게시글 좋아요 토글
   * POST /community/posts/:postId/like
   */
  @Post('posts/:postId/like')
  async togglePostLike(
    @Param('postId') postId: string,
    @Body('userId') userId: string,
  ) {
    return this.communityService.togglePostLike(postId, userId);
  }
}
