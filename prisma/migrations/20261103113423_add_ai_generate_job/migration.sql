-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('PENDING', 'DONE', 'ERROR');

-- CreateTable
CREATE TABLE "AiGenerateJob" (
    "id" TEXT NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGenerateJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGenerateJob_createdAt_idx" ON "AiGenerateJob"("createdAt");

