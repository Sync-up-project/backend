# syntax=docker/dockerfile:1.6
# 운영용 백엔드 이미지 (멀티스테이지).
# - deps: 모든 의존성을 lock 기준으로 설치
# - builder: prisma generate + nest build
# - runner: 산출물 + 필요한 node_modules 만 포함

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl tini wget

ENV NODE_ENV=production \
    PORT=3000

# prisma migrate deploy 가 가능해야 하므로 node_modules 는 빌더에서 통째로 가져옵니다.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# Prisma 7 은 prisma.config.ts 에서 DB 주소를 읽으므로 migrate deploy 에 필요합니다.
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
# src 가 루트의 prisma/ 를 import 하므로 tsc 출력이 dist/src/ 아래에 생깁니다.
CMD ["node", "dist/src/main"]
