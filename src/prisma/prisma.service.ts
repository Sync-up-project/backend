/**
 * PrismaService
 * 
 * Prisma는 TypeScript용 ORM(Object-Relational Mapping)입니다.
 * SQL 쿼리를 직접 작성하지 않고 TypeScript 코드로 데이터베이스를 조작할 수 있습니다.
 * 
 * 이 서비스는:
 * - PrismaClient를 확장하여 데이터베이스 연결을 관리합니다
 * - NestJS의 생명주기 훅을 사용하여 모듈 시작/종료 시 연결을 관리합니다
 * 
 * @implements OnModuleInit, OnModuleDestroy
 * - OnModuleInit: 모듈이 초기화될 때 실행 (DB 연결)
 * - OnModuleDestroy: 모듈이 종료될 때 실행 (DB 연결 해제)
 */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * 모듈 초기화 시 실행
   * 애플리케이션이 시작될 때 데이터베이스에 연결합니다.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * 모듈 종료 시 실행
   * 애플리케이션이 종료될 때 데이터베이스 연결을 정리합니다.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
