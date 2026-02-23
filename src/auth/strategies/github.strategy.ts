// src/auth/strategies/github.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor() {
    super({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
      scope: ['user:email'],
    });
  }

  /**
   * 여기서 리턴한 값이 req.user로 들어갑니다.
   */
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user?: any) => void,
  ) {
    try {
      const githubId = profile?.id;
      const username = profile?.username;

      // 이메일은 공개/비공개 설정에 따라 profile.emails가 비어있을 수 있음
      const emails = Array.isArray(profile?.emails) ? profile.emails : [];
      const primaryEmail =
        emails.find((e: any) => e?.primary)?.value ||
        emails[0]?.value ||
        null;

      const avatarUrl =
        Array.isArray(profile?.photos) && profile.photos[0]?.value
          ? profile.photos[0].value
          : null;

      done(null, {
        githubId,
        username,
        email: primaryEmail,
        avatarUrl,
      });
    } catch (e) {
      done(e, undefined);
    }
  }
}
