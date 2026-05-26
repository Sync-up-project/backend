-- AlterTable
ALTER TABLE "ProjectCalendarEvent"
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'TASK',
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- 기존 status 기본값을 TODO로 변경 (기존 데이터는 유지)
ALTER TABLE "ProjectCalendarEvent" ALTER COLUMN "status" SET DEFAULT 'TODO';

-- CreateIndex
CREATE INDEX "ProjectCalendarEvent_type_idx" ON "ProjectCalendarEvent"("type");
CREATE INDEX "ProjectCalendarEvent_status_idx" ON "ProjectCalendarEvent"("status");
CREATE INDEX "ProjectCalendarEvent_priority_idx" ON "ProjectCalendarEvent"("priority");
CREATE INDEX "ProjectCalendarEvent_completedAt_idx" ON "ProjectCalendarEvent"("completedAt");
CREATE INDEX "ProjectCalendarEvent_order_idx" ON "ProjectCalendarEvent"("order");

