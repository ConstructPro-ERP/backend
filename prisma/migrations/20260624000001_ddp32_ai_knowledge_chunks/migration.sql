CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'AiKnowledgeSourceType'
  ) THEN
    CREATE TYPE "AiKnowledgeSourceType" AS ENUM (
      'PROJECT',
      'MILESTONE',
      'INVOICE',
      'PAYMENT',
      'EXPENSE'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "ai_knowledge_chunks" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceType" "AiKnowledgeSourceType" NOT NULL,
  "sourceId" TEXT,
  "chunkText" TEXT NOT NULL,
  "metadata" JSONB,
  "embeddingModel" VARCHAR(100),
  "embeddingDim" INTEGER,
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_knowledge_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_knowledge_chunks_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_knowledge_chunks_projectId_idx"
  ON "ai_knowledge_chunks"("projectId");

CREATE INDEX IF NOT EXISTS "ai_knowledge_chunks_sourceType_sourceId_idx"
  ON "ai_knowledge_chunks"("sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "ai_knowledge_chunks_embedding_ivfflat_idx"
  ON "ai_knowledge_chunks"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
