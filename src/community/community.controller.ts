import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CommunityService, CreatePostDto, UpdatePostDto, CreateCommentDto } from './community.service';
import { PostCategory } from '@prisma/client';

@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Post('posts')
  async createPost(@Body() dto: CreatePostDto) {
    return this.communityService.createPost(dto);
  }

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

  @Get('posts/:id')
  async findOnePost(@Param('id') id: string) {
    return this.communityService.findOnePost(id);
  }

  @Patch('posts/:id')
  async updatePost(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.communityService.updatePost(id, dto);
  }

  @Delete('posts/:id')
  async removePost(@Param('id') id: string) {
    return this.communityService.removePost(id);
  }

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

  @Delete('comments/:id')
  async removeComment(@Param('id') id: string) {
    return this.communityService.removeComment(id);
  }

  @Post('posts/:postId/like')
  async togglePostLike(
    @Param('postId') postId: string,
    @Body('userId') userId: string,
  ) {
    return this.communityService.togglePostLike(postId, userId);
  }
}
