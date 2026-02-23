// src/users/users.controller.ts
import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type UpdateMeDto = {
  nickname?: string;
  profileImageUrl?: string;
};

type CurrentUserShape = {
  id: string;
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser() user: CurrentUserShape, @Body() body: UpdateMeDto) {
    return this.usersService.updateMe(user.id, body);
  }
}
