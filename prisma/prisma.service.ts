import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is missing in environment variables');
    }

    const adapter = new PrismaPg({ connectionString: url });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // 종료 과정의 마지막 단계에서 연결을 닫습니다.
  // (beforeApplicationShutdown 에서 AI 작업 결과를 DB 에 저장할 수 있도록)
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
