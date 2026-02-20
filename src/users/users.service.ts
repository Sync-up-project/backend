import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMe(
    userId: string,
    body: { nickname?: string; profileImageUrl?: string },
  ) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: body.nickname ?? undefined,
        profileImageUrl: body.profileImageUrl ?? undefined,
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        profileImageUrl: true,
      },
    });

    return { user: updated };
  }
}
