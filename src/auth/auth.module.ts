// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './application/auth-token.service';
import { GithubStrategy } from './strategies/github.strategy';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { AuthThrottleGuard } from './guards/auth-throttle.guard';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    AuthThrottleGuard,
    GithubStrategy,
    JwtAccessStrategy,
  ],
  exports: [AuthService, AuthTokenService],
})
export class AuthModule {}
