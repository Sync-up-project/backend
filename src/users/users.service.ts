import { BadRequestException, Injectable } from '@nestjs/common';
import { Language } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMe(
    userId: string,
    body: {
      nickname?: string;
      profileImageUrl?: string;
      primaryLanguage?: Language;
    },
  ) {
    if (body.primaryLanguage !== undefined) {
      const allowed = new Set<Language>([
        Language.KO,
        Language.EN,
        Language.JA,
      ]);
      if (!allowed.has(body.primaryLanguage)) {
        throw new BadRequestException('primaryLanguage must be KO, EN, or JA');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: body.nickname ?? undefined,
        profileImageUrl: body.profileImageUrl ?? undefined,
        primaryLanguage: body.primaryLanguage ?? undefined,
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        profileImageUrl: true,
        primaryLanguage: true,
      },
    });

    return { user: updated };
  }
}
