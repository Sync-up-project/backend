-- CreateEnum
CREATE TYPE "MemberRemovalStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProjectMemberRemovalRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectMemberId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "ownerApprovedAt" TIMESTAMP(3),
    "memberApprovedAt" TIMESTAMP(3),
    "status" "MemberRemovalStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMemberRemovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMemberRemovalRequest_projectId_idx" ON "ProjectMemberRemovalRequest"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMemberRemovalRequest_projectMemberId_idx" ON "ProjectMemberRemovalRequest"("projectMemberId");

-- CreateIndex
CREATE INDEX "ProjectMemberRemovalRequest_targetUserId_idx" ON "ProjectMemberRemovalRequest"("targetUserId");

-- CreateIndex
CREATE INDEX "ProjectMemberRemovalRequest_requestedById_idx" ON "ProjectMemberRemovalRequest"("requestedById");

-- CreateIndex
CREATE INDEX "ProjectMemberRemovalRequest_status_idx" ON "ProjectMemberRemovalRequest"("status");

-- AddForeignKey
ALTER TABLE "ProjectMemberRemovalRequest" ADD CONSTRAINT "ProjectMemberRemovalRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemberRemovalRequest" ADD CONSTRAINT "ProjectMemberRemovalRequest_projectMemberId_fkey" FOREIGN KEY ("projectMemberId") REFERENCES "ProjectMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemberRemovalRequest" ADD CONSTRAINT "ProjectMemberRemovalRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemberRemovalRequest" ADD CONSTRAINT "ProjectMemberRemovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
