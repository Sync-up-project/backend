-- Add revisionBaseId to AiArtifact for version grouping
ALTER TABLE "AiArtifact"
ADD COLUMN "revisionBaseId" TEXT;

CREATE INDEX "AiArtifact_revisionBaseId_idx" ON "AiArtifact" ("revisionBaseId");
